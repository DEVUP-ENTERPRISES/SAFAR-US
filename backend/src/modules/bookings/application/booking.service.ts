import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { BookingModel, type BookingDoc, type BookingExtension } from '../infrastructure/booking.model';
import { PaymentModel, type PaymentDoc } from '../../payments/infrastructure/payment.model';
import type { AvailabilityDoc } from '../../availability/infrastructure/availability.model';
import { canTransition, type BookingStatus } from '../domain/booking-status';
import { computeRefund } from '../domain/cancellation-policy';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { documentComplianceService } from '../../documents/application/document-compliance.service';
import { vehicleLifecycleService } from '../../vehicles/application/vehicle-lifecycle.service';
import { searchService } from '../../search/application/search.service';
import { trustScoreService } from '../../risk/application/trust-score.service';
import type { VehicleDoc } from '../../vehicles/infrastructure/vehicle.model';
import { verifyPriceLock, issuePriceLock, type PriceLock } from '../../pricing/domain/price-lock';
import { vehicleService } from '../../vehicles/application/vehicle.service';
import { availabilityService, dayKeys, dayAfter, type BlockingRow } from '../../availability/application/availability.service';
import { eligibilityService } from './eligibility.service';
import { riskService } from '../../risk/application/risk.service';
import { userRepository } from '../../users/infrastructure/user.repository';
import { pricingService } from '../../pricing/application/pricing.service';
import { paymentService } from '../../payments/application/payment.service';
import { depositService } from '../../payments/application/deposit.service';
import { walletService } from '../../wallet/application/wallet.service';
import { paymentMethodService } from '../../payments/application/payment-method.service';
import { couponService } from '../../coupons/application/coupon.service';
import { hostService } from '../../hosts/application/host.service';
import { ledgerService } from '../../payments/application/ledger.service';
import { Account, type LedgerLeg } from '../../payments/domain/ledger.accounts';
import { notificationService } from '../../notifications/application/notification.service';
import { logger } from '../../../infrastructure/logging/logger';
import { NotFoundError, ConflictError, ForbiddenError, ValidationError } from '../../../core/errors/app-error';
import { uuid, randomId } from '../../../shared/utils/uuid';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { decodeCursor, cursorFilter, toPage } from '../../../shared/utils/pagination';
import type { Page, Principal } from '../../../core/types/common';
import type { Money } from '../../../core/types/money';
import type { PriceBreakdown } from '../../../core/contracts/pricing.contract';
import type { CreateBookingDto } from '../dto/booking.schemas';

// The approval and verification windows are operational policy (they trade
// conversion against inventory certainty), so they live in PlatformConfig.
const HOUR_MS = 60 * 60 * 1000;

/** Minor units → readable currency for guest- and host-facing copy. */
const formatMinor = (minorUnits: number, currency = 'USD'): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minorUnits / 100);
const approvalWindowMs = async (): Promise<number> =>
  (await platformConfigService.get()).booking.hostApprovalHours * HOUR_MS;

interface SwapOption {
  candidate: VehicleDoc;
  quote: PriceBreakdown;
  /** What the platform pays when the replacement costs more than the guest paid. */
  absorb: number;
}

interface SwapPlan {
  blocker: BookingDoc;
  payment: PaymentDoc;
  paid: number;
  /** Comparable cars, cheapest for the platform first. */
  options: SwapOption[];
}

type ExtensionPlan =
  | { ok: true; newEnd: Date; extraStart: Date; days: number; extra: PriceBreakdown; swap?: SwapPlan }
  | { ok: false; code: string; reason: string; newEnd: Date | null };

export interface ReceiptLine {
  label: string;
  amount: number;
}

export interface Receipt {
  receiptNo: string;
  kind: 'original' | 'extension';
  extensionId?: string;
  issuedAt: Date;
  period: { start: Date; end: Date };
  days: number;
  lines: ReceiptLine[];
  total: Money;
  paymentRef?: string;
}

export interface BookingReceipts {
  bookingId: string;
  code: string;
  currency: string;
  receipts: Receipt[];
  summary: { period: { start: Date; end: Date }; days: number; total: Money };
}

export class BookingService {
  async quote(dto: CreateBookingDto, guestId?: string): Promise<PriceBreakdown> {
    return (await this.quoteWithLock(dto, guestId)).breakdown;
  }

  /**
   * Quote, plus a signed promise of that price.
   *
   * The lock is issued here rather than in the route so it is signed over the
   * same PARSED dates `create()` will later compare against. Signing the raw
   * request values instead makes every genuine lock fail verification, because
   * parsePeriod normalises them.
   */
  async quoteWithLock(
    dto: CreateBookingDto,
    guestId?: string,
  ): Promise<{ breakdown: PriceBreakdown; priceLock?: PriceLock }> {
    const { start, end } = this.parsePeriod(dto.start, dto.end);
    await this.assertBookableWindow(dto.vehicleId, start, end);
    const breakdown = await pricingService.quote({
      vehicleId: dto.vehicleId,
      start,
      end,
      couponCode: dto.couponCode,
      addOnCodes: dto.addOnCodes,
      protectionPlan: dto.protectionPlan,
      delivery: dto.delivery,
      guestId, // membership benefits apply to the price the guest is shown
    });

    // Anonymous callers get a price but no lock — a lock is bound to a guest.
    const priceLock = guestId
      ? issuePriceLock({
          vehicleId: dto.vehicleId,
          guestId,
          start,
          end,
          breakdown,
          ttlMs: (await platformConfigService.get()).booking.priceLockMinutes * 60 * 1000,
        })
      : undefined;
    return { breakdown, priceLock };
  }

  async create(
    guestId: string,
    dto: CreateBookingDto,
    idempotencyKey?: string,
    corp?: { orgId: string; costCenterId?: string },
    ctx?: {
      deviceFingerprint?: string;
      ip?: string;
      userAgent?: string;
      platform?: string;
      emulator?: boolean;
      rooted?: boolean;
      vpn?: boolean;
      coords?: { lat: number; lng: number };
    },
  ): Promise<BookingDoc> {
    if (idempotencyKey) {
      const existing = await BookingModel.findOne({ idempotencyKey }).lean<BookingDoc>();
      if (existing) return existing;
    }

    const { start, end } = this.parsePeriod(dto.start, dto.end);
    const vehicle = await vehicleService.getForBooking(dto.vehicleId);
    if (!vehicle.bookable) throw new ConflictError('Vehicle is not bookable', 'NOT_BOOKABLE');

    // Legal gate: never let a paying trip start on a car whose insurance or
    // registration has lapsed. The hourly compliance sweep pauses such cars, but
    // this closes the window between a document expiring and the next sweep.
    if (await documentComplianceService.hasExpiredMandatoryDoc(dto.vehicleId)) {
      throw new ConflictError('This car is temporarily unavailable while its documents are renewed.', 'DOCS_EXPIRED');
    }

    // Operational gate: a car that is physically down (in maintenance, repair,
    // a safety hold, or awaiting reactivation approval) cannot be handed to a
    // new guest — regardless of what the calendar says. This is point-in-time
    // physical state, so it does not touch future-dated availability; it only
    // refuses a booking while the car is out of service.
    if (!(await vehicleLifecycleService.isOperableForBooking(dto.vehicleId))) {
      throw new ConflictError('This car is temporarily out of service.', 'VEHICLE_OUT_OF_SERVICE');
    }

    // Terms & Conditions: a booking is a contract, so we record exactly which
    // version the guest accepted, when, and from where — and refuse a blank or
    // stale acceptance (e.g. the terms were bumped while the form was open).
    const { legal } = await platformConfigService.get();
    if (dto.acceptedTermsVersion !== legal.termsVersion) {
      throw new ConflictError(
        'Please review and accept the current Terms & Conditions to continue.',
        'TERMS_OUTDATED',
      );
    }
    const acceptedTerms = { version: legal.termsVersion, acceptedAt: new Date(), ip: ctx?.ip };
    if (vehicle.hostId && guestId === (await this.hostUserId(vehicle.hostId))) {
      throw new ForbiddenError('You cannot book your own vehicle');
    }
    this.assertDuration(start, end, vehicle.minTripHours, vehicle.maxTripHours);

    // Advance notice: the host needs lead time before a trip can start. A start
    // sooner than that is rejected — checked against wall-clock now, not the
    // booking time, so a request that sat in a form for an hour is judged fresh.
    const noticeMinutes = Math.max(
      (await platformConfigService.get()).booking.minLeadMinutes,
      (vehicle.advanceNoticeHours ?? 0) * 60,
    );
    if (noticeMinutes > 0 && start.getTime() < Date.now() + noticeMinutes * 60_000) {
      const label = noticeMinutes % 60 === 0 ? `${noticeMinutes / 60} hour${noticeMinutes === 60 ? '' : 's'}` : `${noticeMinutes} minutes`;
      throw new ConflictError(`This car must be booked at least ${label} before pickup. Pick a later start time.`, 'ADVANCE_NOTICE');
    }

    if (!(await availabilityService.isAvailable(dto.vehicleId, start, end))) {
      throw new ConflictError('Vehicle is not available for the selected dates', 'NOT_AVAILABLE');
    }

    // Identity gate. A suspended account cannot request at all; an unverified
    // one may request — so their check runs alongside the host's decision
    // rather than after it — but nothing is captured and no key changes hands
    // until it clears. See eligibility.service for why this is an insurance
    // requirement, not just a fraud control.
    const eligibility = await eligibilityService.evaluate(guestId, end);
    if (!eligibility.canRequest) {
      throw new ForbiddenError('This account cannot book. Contact support.');
    }

    // Risk is assessed per attempt, not per account: the same person on a
    // known device at home is a different proposition from that person on a
    // fresh emulator behind a datacenter IP.
    const risk = await riskService.evaluate({
      userId: guestId,
      context: 'booking',
      ...(ctx ?? {}),
    });
    if (risk.action === 'deny') {
      // Deliberately vague. Telling someone which signal caught them is free
      // tuning feedback for the next attempt.
      throw new ForbiddenError('We could not complete this booking. Contact support.');
    }
    if (risk.action === 'review') {
      await userRepository.setStatus(guestId, 'under_review', {
        reason: `Risk review (score ${risk.score}) at booking`,
        by: 'system',
      });
      throw new ForbiddenError(
        'We need to check a few things before confirming this booking. We will be in touch shortly.',
      );
    }

    const breakdown = await pricingService.quote({
      vehicleId: dto.vehicleId,
      start,
      end,
      couponCode: dto.couponCode,
      addOnCodes: dto.addOnCodes,
      protectionPlan: dto.protectionPlan,
      delivery: dto.delivery,
      guestId, // the price they're charged must match the price they were quoted
    });

    // Honour the quoted price.
    //
    // Recomputing here is correct — the guest must not be able to name their
    // own price — but a *cheaper* recomputation is fine, and a dearer one is
    // not: it means something moved (surge, a seasonal rule, an expired coupon)
    // between the screen and this call, and the guest never agreed to it.
    if (dto.priceLock) {
      const check = verifyPriceLock(dto.priceLock, {
        vehicleId: dto.vehicleId,
        guestId,
        start,
        end,
      });
      if (!check.ok && check.reason === 'mismatch') {
        // The lock is genuine but describes a different booking — either the
        // dates moved after quoting, or a cheap lock is being replayed on
        // expensive dates. Both need a fresh quote; neither is charged.
        throw new ConflictError(
          'These dates no longer match your quote. Please review the price.',
          'PRICE_LOCK_STALE',
        );
      }
      if (!check.ok && check.reason !== 'expired') {
        // Forged or malformed — not an honest client.
        throw new ForbiddenError('This quote is not valid for this booking.');
      }
      if (check.ok && breakdown.total.amount > dto.priceLock.total) {
        throw new ConflictError(
          'The price changed while you were booking. Please review the new total.',
          'PRICE_CHANGED',
        );
      }
    }

    // Trust gate on Instant Book: a brand-new guest (no reputation yet) does not
    // get to skip host approval on an instant car — the booking falls back to a
    // request the host approves, protecting hosts from unvetted instant trips.
    // Proven guests instant-book as normal.
    const trustPerks = await trustScoreService.perks(guestId);
    const effectiveInstant = vehicle.instantBook && trustPerks.instantBookEligible;

    // Pay-with-wallet: apply available balance, card charges the remainder.
    // Supported on instant bookings (captured immediately).
    let walletApplied = 0;
    if (dto.useWallet && effectiveInstant && eligibility.eligible) {
      const balance = await walletService.balance(guestId);
      walletApplied = Math.min(balance, breakdown.total.amount);
    }

    // Without a card nothing is authorised, so "your card is held" would be untrue and a later capture would fail.
    if (breakdown.total.amount - walletApplied > 0 && !(await paymentMethodService.hasChargeableCard(guestId))) {
      throw new ConflictError('Add a payment card to book this trip. It isn’t charged until the trip is confirmed.', 'PAYMENT_METHOD_REQUIRED');
    }

    // Reserve the slot BEFORE talking to the gateway (prevents double-booking
    // during the payment round-trip). Roll back on any downstream failure.
    const holdId = await availabilityService.placeHold(dto.vehicleId, start, end);
    // Held outside the try so the failure path can reverse a charge that
    // succeeded before a later step threw.
    let charged: { paymentId: string; intentId: string; status: string } | null = null;
    const bookingId = uuid();

    try {
      const charge = await paymentService.chargeForBooking({
        bookingId,
        guestId,
        hostId: vehicle.hostId,
        // Instant Book still means instant *for a verified guest*. An
        // unverified one is authorised only; capture happens when they clear.
        capture: effectiveInstant && eligibility.eligible,
        total: breakdown.total,
        // Protection, service fee and rental tax ride in the platform legs so the ledger balances.
        ...this.paymentSplit(breakdown),
        walletApplied,
        idempotencyKey: idempotencyKey ?? bookingId,
      });

      charged = { paymentId: charge.paymentId, intentId: charge.intentId, status: charge.status };

      // Deduct the wallet portion (only after the card charge succeeded).
      if (walletApplied > 0) {
        await walletService.spend(guestId, walletApplied, 'booking', bookingId);
      }

      /*
       * A booking is only 'paid' when the money actually moved.
       *
       * `effectiveInstant` describes what the listing allows, not what the card
       * did. Marking a booking paid off that alone meant a 3-D Secure challenge
       * or a soft decline still produced a confirmed, unpaid trip — the host
       * would show up for it.
       */
      const paymentCleared = charge.status === 'succeeded' || charge.status === 'authorized';
      const status: BookingStatus = !eligibility.eligible
        ? 'pending_verification'
        : effectiveInstant && paymentCleared
          ? 'paid'
          : effectiveInstant && !paymentCleared
            ? 'pending_payment'
            : 'pending_approval';
      const now = new Date();

      const booking = await BookingModel.create({
        _id: bookingId,
        code: this.generateCode(),
        guestId,
        hostId: vehicle.hostId,
        vehicleId: dto.vehicleId,
        period: { start, end },
        priceBreakdown: breakdown,
        cancellationPolicy: vehicle.cancellationPolicy,
        terms: acceptedTerms, // the T&C version this guest accepted to book
        delivery: dto.delivery, // where the host brings the car, if requested
        status,
        statusHistory: [{ from: null, to: status, at: now, by: guestId }],
        holdId,
        paymentId: charge.paymentId,
        couponCode: dto.couponCode,
        orgId: corp?.orgId,
        costCenterId: corp?.costCenterId,
        instantBook: effectiveInstant,
        verificationBlockers: eligibility.blockers,
        approvalDeadline: effectiveInstant
          ? undefined
          : new Date(Math.min(start.getTime(), now.getTime() + (await approvalWindowMs()))),
        idempotencyKey,
      });

      if (status === 'paid') {
        await availabilityService.confirmHold(holdId, bookingId);
      } else if (status === 'pending_approval') {
        // Held until the host's own response window, not the short
        // checkout-hold TTL — otherwise the days free up while the host
        // still legitimately has time left to accept.
        await availabilityService.extendHold(holdId, booking.approvalDeadline!);
      } else if (status === 'pending_verification') {
        await availabilityService.extendHold(
          holdId,
          new Date(now.getTime() + (await platformConfigService.get()).booking.verificationGraceHours * HOUR_MS),
        );
      } else if (status === 'pending_payment') {
        await availabilityService.extendHold(
          holdId,
          new Date(now.getTime() + (await platformConfigService.get()).booking.paymentPendingMinutes * 60_000),
        );
      }
      // Records who redeemed what, on which booking — enforcing per-user limits
      // and tracking campaign spend against its budget.
      if (dto.couponCode) {
        await couponService.redeem(dto.couponCode, {
          userId: guestId,
          bookingId,
          discount: breakdown.discount,
        });
      }

      emit(EVENTS.BOOKING_CREATED, bookingId, {
        bookingId,
        guestId,
        hostId: vehicle.hostId,
        instantBook: vehicle.instantBook,
        // What the booking actually IS, not what the listing allows. Telling a
        // guest their trip is confirmed off `instantBook` alone announced a
        // confirmation for a booking whose card had not cleared.
        status,
        verificationBlockers: eligibility.blockers,
      });
      if (status === 'paid') {
        emit(EVENTS.BOOKING_CONFIRMED, bookingId, { bookingId, guestId, hostId: vehicle.hostId, instant: true });
      }

      // The client needs the secret to finish a 3-D Secure challenge, and needs
      // to know that it must.
      return {
        ...booking.toObject(),
        ...(charge.requiresAction
          ? { requiresAction: true, clientSecret: charge.clientSecret }
          : {}),
      };
    } catch (err) {
      await availabilityService.releaseHold(holdId);

      /*
       * Give the money back.
       *
       * The card is charged before the booking row is written, so anything
       * that threw after that point — a duplicate code, a validation slip, a
       * dropped connection — left the guest paid with no booking, no record to
       * point at, and no way to get it back except a chargeback. Releasing the
       * hold without reversing the charge is the single worst outcome in this
       * whole flow.
       *
       * Reversal is best-effort and never masks the original error: if it also
       * fails, the guest still needs to know the booking did not happen, and
       * the log carries the payment id so finance can settle it by hand.
       */
      if (charged) {
        try {
          if (charged.status === 'succeeded') {
            await paymentService.refundBooking(bookingId, breakdown.total, 'Booking could not be created');
          } else {
            await paymentService.cancelAuthorization(bookingId);
          }
          logger.warn(
            { bookingId, paymentId: charged.paymentId, status: charged.status },
            'booking failed after charge — payment reversed',
          );
        } catch (reversalErr) {
          // Loud, and with everything finance needs to fix it manually.
          logger.error(
            {
              bookingId,
              paymentId: charged.paymentId,
              intentId: charged.intentId,
              guestId,
              amount: breakdown.total.amount,
              currency: breakdown.total.currency,
              err: (reversalErr as Error).message,
            },
            'CRITICAL: guest was charged, booking failed, and the reversal ALSO failed — manual refund required',
          );
        }
      }

      throw err;
    }
  }

  /**
   * A guest cleared identity — move every request that was waiting on them.
   *
   * Called from the KYC decision handler. Each held booking goes wherever it
   * would have gone had the guest been verified when they asked: straight to
   * `paid` for an Instant Book car (capturing the authorisation taken at
   * request time), or into the host's queue otherwise.
   */
  async onGuestVerified(guestId: string): Promise<number> {
    const held = await BookingModel.find({
      guestId,
      status: 'pending_verification',
    }).lean<BookingDoc[]>();

    let promoted = 0;
    for (const booking of held) {
      // Re-check rather than trust the caller: this booking's own end date may
      // be past the licence expiry even though the licence is approved.
      const eligibility = await eligibilityService.evaluate(guestId, booking.period.end);
      if (!eligibility.eligible) continue;

      // The trip may have started while they were being reviewed.
      if (booking.period.start.getTime() < Date.now()) {
        await this.systemCancel(booking._id, 'Verification completed after the trip start time');
        continue;
      }
      // Someone else may have taken the dates.
      // Ignore this booking's own hold — it has been sitting on the slot the
      // whole time it was waiting for us.
      const free = await availabilityService.isAvailable(
        booking.vehicleId,
        booking.period.start,
        booking.period.end,
        booking.holdId,
      );
      if (!free) {
        await this.systemCancel(booking._id, 'The dates were taken while we verified your licence');
        continue;
      }

      const doc = await this.getDoc(booking._id);

      /*
       * Re-evaluate Instant Book now, rather than trusting the flag stored at
       * creation.
       *
       * That flag was computed while the guest was still unverified, so their
       * trust tier was 'new' and Instant Book was denied. Clearing verification
       * is exactly what lifts the tier — so honouring the stale value would
       * push the guest into manual host approval for a car the host had
       * configured to book instantly, penalising precisely the people who did
       * what we asked. The host's own setting still governs: a car that was
       * never Instant Book stays on approval.
       */
      const vehicle = await vehicleService.getForBooking(booking.vehicleId).catch(() => null);
      const perks = await trustScoreService.perks(guestId);
      const instantNow = !!vehicle?.instantBook && perks.instantBookEligible;
      if (instantNow !== booking.instantBook) {
        await BookingModel.updateOne({ _id: booking._id }, { instantBook: instantNow });
      }

      if (instantNow) {
        try {
          await paymentService.captureBooking(booking._id);
        } catch (err) {
          // The hold lapsed or the card refused: hand it to the same path as any failed payment so both sides are told.
          emit(EVENTS.PAYMENT_FAILED, booking._id, { bookingId: booking._id, reason: (err as Error).message });
          continue;
        }
        await availabilityService.confirmHold(booking.holdId!, booking._id);
        await this.transition(doc, 'paid', guestId, 'Identity verified');
        emit(EVENTS.BOOKING_CONFIRMED, booking._id, {
          bookingId: booking._id,
          guestId,
          hostId: booking.hostId,
          instant: true,
        });
      } else {
        await BookingModel.updateOne(
          { _id: booking._id },
          {
            approvalDeadline: new Date(
              Math.min(booking.period.start.getTime(), Date.now() + (await approvalWindowMs())),
            ),
          },
        );
        await this.transition(doc, 'pending_approval', guestId, 'Identity verified');
      }
      await BookingModel.updateOne({ _id: booking._id }, { verificationBlockers: [] });
      promoted += 1;
    }
    return promoted;
  }

  /**
   * The platform ends a booking through no fault of either party — failed
   * verification, lost dates, payment failure, a declared disaster. Always a
   * full refund and never a host penalty.
   */
  async systemCancel(bookingId: string, reason: string): Promise<void> {
    const booking = await this.getDoc(bookingId);
    if (!canTransition(booking.status, 'cancelled_system')) return;

    const total = booking.priceBreakdown.total;
    let refund = { amount: 0, currency: total.currency };
    if (booking.status === 'paid' || booking.status === 'confirmed') {
      refund = { ...total };
      await paymentService.refundBooking(bookingId, refund, reason);
    } else {
      await paymentService.cancelAuthorization(bookingId);
    }

    await availabilityService.releaseBooking(bookingId);
    if (booking.holdId) await availabilityService.releaseHold(booking.holdId);
    await BookingModel.updateOne(
      { _id: bookingId },
      { cancellation: { by: 'system', role: 'system', at: new Date(), reason, refund } },
    );
    await this.transition(booking, 'cancelled_system', 'system', reason);
    emit(EVENTS.BOOKING_CANCELLED, bookingId, {
      bookingId,
      guestId: booking.guestId,
      hostId: booking.hostId,
      cancelledBy: 'system',
      refund,
    });
  }

  /**
   * The platform took a car off the road (safety recall, expired insurance).
   * Guests holding future trips on it are released with a full refund and no
   * host penalty, and offered a replacement — never left to find out at pickup.
   */
  async cancelUpcomingForVehicle(vehicleId: string, reason: string, withinHours?: number): Promise<number> {
    const upcoming = await BookingModel.find({
      vehicleId,
      status: { $in: ['pending_verification', 'pending_approval', 'pending_payment', 'confirmed', 'paid'] },
      'period.start': {
        $gt: new Date(),
        // A renewable problem only threatens trips that start before it can be fixed.
        ...(withinHours ? { $lte: new Date(Date.now() + withinHours * HOUR_MS) } : {}),
      },
    }).lean<BookingDoc[]>();
    let cancelled = 0;
    for (const b of upcoming) {
      try {
        await this.systemCancel(b._id, `Your car is unavailable: ${reason}`);
        emit(EVENTS.BOOKING_REBOOKING_NEEDED, b._id, {
          bookingId: b._id, guestId: b.guestId, vehicleId: b.vehicleId,
          start: b.period.start, end: b.period.end, reason: 'vehicle_unavailable',
        });
        cancelled += 1;
      } catch (err) {
        logger.error({ err, bookingId: b._id, vehicleId }, 'could not release booking on unavailable vehicle');
      }
    }
    return cancelled;
  }

  /** Bookings parked waiting on this guest's identity check. */
  async listHeldForVerification(guestId: string): Promise<BookingDoc[]> {
    return BookingModel.find({ guestId, status: 'pending_verification' }).lean<BookingDoc[]>();
  }

  /** Host approves a request-to-book booking. */
  async confirm(userId: string, bookingId: string): Promise<BookingDoc> {
    const booking = await this.getDoc(bookingId);
    await this.assertHostOwner(userId, booking.hostId);
    if (booking.status !== 'pending_approval') {
      throw new ConflictError('Booking is not awaiting approval', 'INVALID_STATE');
    }
    await paymentService.captureBooking(bookingId);
    await availabilityService.confirmHold(booking.holdId!, bookingId);
    await this.transition(booking, 'paid', userId, 'Host approved');
    emit(EVENTS.BOOKING_CONFIRMED, bookingId, { bookingId, guestId: booking.guestId, hostId: booking.hostId });
    return this.getDoc(bookingId);
  }

  /** Host declines a request-to-book booking. */
  async decline(userId: string, bookingId: string): Promise<BookingDoc> {
    const booking = await this.getDoc(bookingId);
    await this.assertHostOwner(userId, booking.hostId);
    if (booking.status !== 'pending_approval') {
      throw new ConflictError('Booking is not awaiting approval', 'INVALID_STATE');
    }
    await paymentService.cancelAuthorization(bookingId);
    await availabilityService.releaseHold(booking.holdId!);
    await this.transition(booking, 'declined', userId, 'Host declined');
    // The guest is waiting on this answer — a decline that tells nobody leaves
    // them staring at "awaiting host" while their authorisation is quietly
    // released.
    emit(EVENTS.BOOKING_DECLINED, bookingId, {
      bookingId,
      guestId: booking.guestId,
      hostId: booking.hostId,
      vehicleId: booking.vehicleId,
    });
    return this.getDoc(bookingId);
  }

  /** Guest or host cancels; refund computed by policy. */
  async cancel(principal: Principal, bookingId: string, reason: string): Promise<BookingDoc> {
    const booking = await this.getDoc(bookingId);
    const isGuest = booking.guestId === principal.userId;
    const isHost = await this.isHostOwner(principal.userId, booking.hostId);
    const isAdmin = principal.permissions.includes('booking:read:any') || principal.permissions.includes('*');
    if (!isGuest && !isHost && !isAdmin) throw new ForbiddenError('Cannot cancel this booking');

    if (!['pending_verification', 'pending_approval', 'pending_payment', 'confirmed', 'paid'].includes(booking.status)) {
      throw new ConflictError('Booking cannot be cancelled in its current state', 'INVALID_STATE');
    }

    // Who ended it decides the refund, the host penalty, and whether Trust &
    // Safety cares. A single `cancelled` made those three indistinguishable.
    const actor: BookingStatus = isHost
      ? 'cancelled_host'
      : isGuest
        ? 'cancelled_guest'
        : 'cancelled_system';

    const total = booking.priceBreakdown.total;
    let refund = { amount: 0, currency: total.currency };

    if (booking.status === 'paid' || booking.status === 'confirmed') {
      // Host and admin cancellations refund in full — the guest did nothing
      // wrong and is being stranded. Only a guest cancellation is policy-bound.
      const cancelCfg = (await platformConfigService.get()).cancellation;
      refund = isGuest
        ? computeRefund(booking.cancellationPolicy, total, booking.period.start, cancelCfg)
        : { ...total };
      if (refund.amount > 0) {
        await paymentService.refundBooking(bookingId, refund, reason);
      }
    } else {
      await paymentService.cancelAuthorization(bookingId);
    }

    await availabilityService.releaseBooking(bookingId);
    if (booking.holdId) await availabilityService.releaseHold(booking.holdId);

    await BookingModel.updateOne(
      { _id: bookingId },
      {
        cancellation: {
          by: principal.userId,
          role: isHost ? 'host' : isGuest ? 'guest' : 'admin',
          at: new Date(),
          reason,
          refund,
        },
      },
    );
    await this.transition(booking, actor, principal.userId, reason);
    emit(EVENTS.BOOKING_CANCELLED, bookingId, {
      bookingId,
      guestId: booking.guestId,
      hostId: booking.hostId,
      cancelledBy: isHost ? 'host' : isGuest ? 'guest' : 'system',
      refund,
    });
    // A host cancel strands the guest — offer rebooking on a similar free car,
    // and make the cancellation cost the host something.
    if (isHost) {
      await this.chargeHostCancellationPenalty(booking).catch((err) =>
        logger.warn({ err, bookingId }, 'host cancellation penalty failed'),
      );
      emit(EVENTS.BOOKING_REBOOKING_NEEDED, bookingId, {
        bookingId, guestId: booking.guestId, vehicleId: booking.vehicleId,
        start: booking.period.start, end: booking.period.end, reason: 'host_cancel',
      });
    }
    return this.getDoc(bookingId);
  }

  /**
   * No-show: the start time + grace has passed and no handover happened.
   *
   * A guest no-show forfeits a configurable share (the host earns their part of
   * it, paid through the normal payout pipeline); the rest is refunded. A host
   * no-show is a full refund plus a rebooking offer for the stranded guest. Who
   * may declare it is asymmetric — the host reports a guest no-show and vice
   * versa — so neither side can self-serve a favourable outcome.
   */
  async noShow(principal: Principal, bookingId: string, party: 'guest' | 'host'): Promise<BookingDoc> {
    const booking = await this.getDoc(bookingId);
    const isHost = await this.isHostOwner(principal.userId, booking.hostId);
    const isGuest = booking.guestId === principal.userId;
    const isAdmin = principal.permissions.includes('*') || principal.permissions.includes('booking:read:any');
    if (party === 'guest' && !(isHost || isAdmin)) throw new ForbiddenError('Only the host can report a guest no-show');
    if (party === 'host' && !(isGuest || isAdmin)) throw new ForbiddenError('Only the guest can report a host no-show');

    if (booking.status !== 'paid') {
      throw new ConflictError('No-show applies only to a confirmed, paid trip that has not started', 'INVALID_STATE');
    }
    if (booking.tripId) throw new ConflictError('The trip has already started', 'INVALID_STATE');

    const cfg = await platformConfigService.get();

    /*
     * The grace clock runs from the later of the booked start and the guest's
     * scheduled landing.
     *
     * A guest meeting their car at an airport cannot arrive before their plane
     * does, and flights slip constantly. Measuring only from the booked start
     * would let a host declare a no-show against someone still in the air —
     * penalising a guest for a delay they had no part in. The host is not
     * disadvantaged: the clock still runs, it just starts when the guest could
     * realistically be there.
     */
    const bookedStart = new Date(booking.period.start).getTime();
    const arrival = booking.delivery?.arrivesAt ? new Date(booking.delivery.arrivesAt).getTime() : 0;
    const clockFrom = Math.max(bookedStart, Number.isFinite(arrival) ? arrival : 0);
    const earliest = clockFrom + cfg.noShow.graceHours * 3_600_000;
    if (Date.now() < earliest) {
      const anchored = clockFrom > bookedStart ? ' after the flight’s scheduled arrival' : ' after the start time';
      throw new ConflictError(
        `Wait until ${cfg.noShow.graceHours}h${anchored} to declare a no-show.`,
        'TOO_EARLY',
      );
    }

    const total = booking.priceBreakdown.total;

    if (party === 'host') {
      await paymentService.refundBooking(bookingId, total, 'Host no-show — full refund');
      await availabilityService.releaseBooking(bookingId);
      if (booking.holdId) await availabilityService.releaseHold(booking.holdId);
      await BookingModel.updateOne(
        { _id: bookingId },
        { cancellation: { by: principal.userId, role: isGuest ? 'guest' : 'admin', at: new Date(), reason: 'Host no-show', refund: total } },
      );
      await this.transition(booking, 'cancelled_host', principal.userId, 'Host no-show');
      emit(EVENTS.BOOKING_HOST_NO_SHOW, bookingId, { bookingId, guestId: booking.guestId, hostId: booking.hostId });
      emit(EVENTS.BOOKING_REBOOKING_NEEDED, bookingId, {
        bookingId, guestId: booking.guestId, vehicleId: booking.vehicleId,
        start: booking.period.start, end: booking.period.end, reason: 'host_no_show',
      });
      return this.getDoc(bookingId);
    }

    // Guest no-show — forfeit a share, refund the rest, scale the host's earnings
    // to their part of the forfeit (paid via the payout subscriber).
    const forfeitBps = cfg.noShow.guestForfeitBps;
    const refundAmount = Math.round((total.amount * (10000 - forfeitBps)) / 10000);
    if (refundAmount > 0) {
      await paymentService.refundBooking(bookingId, { amount: refundAmount, currency: total.currency }, 'Guest no-show — partial forfeit');
    }
    const pb = booking.priceBreakdown;
    const scale = forfeitBps / 10000;
    await BookingModel.updateOne(
      { _id: bookingId },
      {
        $set: {
          'priceBreakdown.total.amount': total.amount - refundAmount,
          'priceBreakdown.hostEarnings.amount': Math.round(pb.hostEarnings.amount * scale),
          'priceBreakdown.commission.amount': Math.round(pb.commission.amount * scale),
          'priceBreakdown.tax.amount': Math.round(pb.tax.amount * scale),
        },
        cancellation: { by: principal.userId, role: isHost ? 'host' : 'admin', at: new Date(), reason: 'Guest no-show', refund: { amount: refundAmount, currency: total.currency } },
      },
    );
    await availabilityService.releaseBooking(bookingId);
    await this.transition(booking, 'cancelled_guest', principal.userId, 'Guest no-show — forfeit applied');
    emit(EVENTS.BOOKING_GUEST_NO_SHOW, bookingId, { bookingId, guestId: booking.guestId, hostId: booking.hostId });
    return this.getDoc(bookingId);
  }

  /**
   * Issue the guest's pickup code — a 6-digit handshake the host verifies at
   * handover to prove the guest is physically present with the car. Stored only
   * as a SHA-256 hash; re-issuing rotates it.
   */
  async issuePickupCode(principal: Principal, bookingId: string): Promise<{ code: string }> {
    const booking = await this.getDoc(bookingId);
    if (booking.guestId !== principal.userId) throw new ForbiddenError('Only the guest holds the pickup code');
    if (!['paid', 'confirmed', 'in_progress'].includes(booking.status)) {
      throw new ConflictError('A pickup code applies only to a confirmed trip', 'INVALID_STATE');
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const hash = createHash('sha256').update(code).digest('hex');
    // A new code starts clean: attempts reset and any earlier verification no longer counts.
    await BookingModel.updateOne(
      { _id: bookingId },
      { $set: { pickupCodeHash: hash, pickupCodeAttempts: 0 }, $unset: { pickupVerifiedAt: '', pickupVerifiedBy: '' } },
    );
    return { code };
  }

  /**
   * Check a presented pickup code and, when right, record who verified it.
   * Each try is reserved atomically first so parallel guesses cannot beat the
   * attempt limit; the code locks until the guest issues a new one.
   */
  async verifyPickupCode(bookingId: string, code: string, byUserId: string): Promise<void> {
    const booking = await this.getDoc(bookingId);
    if (booking.pickupVerifiedAt) return;
    if (!booking.pickupCodeHash) {
      throw new ConflictError('The guest has not generated a pickup code yet.', 'PICKUP_CODE_INVALID');
    }
    const max = (await platformConfigService.get()).handover.maxCodeAttempts;
    const reserved = await BookingModel.findOneAndUpdate(
      { _id: bookingId, pickupCodeHash: booking.pickupCodeHash, ...(max > 0 ? { pickupCodeAttempts: { $not: { $gte: max } } } : {}) },
      { $inc: { pickupCodeAttempts: 1 } },
      { new: true },
    ).lean<BookingDoc>();
    if (!reserved) {
      throw new ConflictError('Too many wrong codes. The guest must generate a new pickup code.', 'PICKUP_CODE_LOCKED');
    }

    const given = createHash('sha256').update(code).digest();
    const stored = Buffer.from(booking.pickupCodeHash, 'hex');
    if (stored.length === given.length && timingSafeEqual(given, stored)) {
      await BookingModel.updateOne({ _id: bookingId }, { pickupVerifiedAt: new Date(), pickupVerifiedBy: byUserId, pickupCodeAttempts: 0 });
      return;
    }

    const remaining = max > 0 ? max - (reserved.pickupCodeAttempts ?? 0) : Infinity;
    if (remaining <= 0) {
      emit(EVENTS.PICKUP_CODE_LOCKED, bookingId, { bookingId, guestId: booking.guestId, hostId: booking.hostId });
      throw new ConflictError('Too many wrong codes. The guest must generate a new pickup code.', 'PICKUP_CODE_LOCKED');
    }
    throw new ConflictError(
      remaining === Infinity ? 'That pickup code is not correct.' : `That pickup code is not correct. ${remaining} ${remaining === 1 ? 'try' : 'tries'} left.`,
      'PICKUP_CODE_INVALID',
    );
  }

  /**
   * Rebooking protection — when the host cancels or no-shows, the guest is not
   * left stranded: we surface similar cars actually free for their exact dates
   * (same metro, same category first) and let them rebook in one tap.
   */
  /**
   * Replacement cars for a stranded guest, each priced and showing exactly what
   * the guarantee covers.
   *
   * The guest is deciding under stress, so "similar cars" alone is not enough —
   * they need to see, per car, what they would actually pay after the
   * guarantee. Quoting each option is a handful of reads and turns the promise
   * into a number before they commit.
   */
  async rebookingOptions(
    principal: Principal,
    bookingId: string,
  ): Promise<{
    originalTotal: Money;
    protection: { enabled: boolean; coverageBps: number; maxCoverageCents: number; expiresAt: Date | null };
    options: {
      vehicle: VehicleDoc;
      total: Money;
      difference: number;
      covered: number;
      youPay: Money;
      fullyCovered: boolean;
    }[];
  }> {
    const booking = await this.getDoc(bookingId);
    if (booking.guestId !== principal.userId) throw new ForbiddenError('Not your booking');

    const { rebookingProtection: cfg } = await platformConfigService.get();
    const vehicles = await searchService.similarTo(booking.vehicleId, {
      start: booking.period.start,
      end: booking.period.end,
      limit: 6,
    });

    const originalTotal = booking.priceBreakdown.total;
    const cancelledAt = booking.cancellation?.at ?? booking.updatedAt;
    const expiresAt = cfg.enabled
      ? new Date(new Date(cancelledAt).getTime() + cfg.windowHours * 3_600_000)
      : null;
    const stillCovered = cfg.enabled && !!expiresAt && expiresAt.getTime() > Date.now();

    /*
     * Quote every candidate at once, not one after another.
     *
     * These are independent — each only needs the vehicle and the dates — but
     * they were awaited in sequence, so the page cost six round trips of
     * pricing (config, surge, tax, membership, commission) stacked end to end.
     * This is a stranded guest looking at replacement cars, which is the worst
     * possible moment to make them wait.
     */
    const quotes = await Promise.all(
      vehicles.map((vehicle) =>
        pricingService
          .quote({
            vehicleId: vehicle._id,
            start: booking.period.start,
            end: booking.period.end,
            guestId: booking.guestId,
          })
          .then((quote) => ({ vehicle, quote }))
          // One unpriceable car must not take the whole list down with it.
          .catch(() => ({ vehicle, quote: null })),
      ),
    );

    const options = [];
    for (const { vehicle, quote } of quotes) {
      if (!quote) continue;

      const difference = Math.max(0, quote.total.amount - originalTotal.amount);
      const covered = stillCovered
        ? Math.min(Math.floor((difference * cfg.coverageBps) / 10000), cfg.maxCoverageCents)
        : 0;
      options.push({
        vehicle,
        total: quote.total,
        difference,
        covered,
        youPay: { amount: quote.total.amount - covered, currency: quote.total.currency },
        fullyCovered: difference > 0 && covered >= difference,
      });
    }

    // Cheapest out-of-pocket first — what the guest actually cares about.
    options.sort((a, b) => a.youPay.amount - b.youPay.amount);

    return {
      originalTotal,
      protection: {
        enabled: stillCovered,
        coverageBps: cfg.coverageBps,
        maxCoverageCents: cfg.maxCoverageCents,
        expiresAt,
      },
      options,
    };
  }

  /**
   * Rebook a stranded guest onto another car — at the price they originally
   * agreed.
   *
   * A host cancelling almost always forces the guest into last-minute pricing
   * for the same dates, so a plain refund still leaves them out of pocket for
   * someone else's failure. The guarantee closes that gap: the platform pays
   * the difference (capped, and only inside the window), the guest keeps their
   * original price, and the host who caused it has already been penalised.
   *
   * The credit lands in the guest's wallet rather than reducing the charge, so
   * the new booking prices normally — the host of the replacement car is paid
   * in full and never subsidises another host's cancellation.
   */
  async rebook(principal: Principal, bookingId: string, vehicleId: string): Promise<BookingDoc> {
    const booking = await this.getDoc(bookingId);
    if (booking.guestId !== principal.userId) throw new ForbiddenError('Not your booking');
    if (booking.status !== 'cancelled_host') {
      throw new ConflictError('Rebooking is offered only when the host cancelled or no-showed', 'NOT_REBOOKABLE');
    }
    if (vehicleId === booking.vehicleId) {
      throw new ValidationError('Pick a different car to rebook');
    }

    const replacement = await this.create(
      principal.userId,
      { vehicleId, start: booking.period.start.toISOString(), end: booking.period.end.toISOString() } as CreateBookingDto,
      `rebook_${bookingId}_${vehicleId}`,
    );

    const covered = await this.applyRebookingProtection(booking, replacement).catch((err) => {
      // The guest already has a car; a failure here must not undo that.
      logger.error({ err, bookingId, replacementId: replacement._id }, 'rebooking protection failed');
      return 0;
    });

    return covered > 0 ? this.getDoc(replacement._id) : replacement;
  }

  /**
   * Pay the price difference on a guarantee-covered rebooking.
   *
   * Returns what was covered, in minor units (0 when nothing was owed).
   */
  private async applyRebookingProtection(original: BookingDoc, replacement: BookingDoc): Promise<number> {
    const { rebookingProtection: cfg } = await platformConfigService.get();
    if (!cfg.enabled) return 0;

    // The promise has a shelf life — otherwise a guest could sit on a cancelled
    // booking for weeks and claim the gap once prices had moved for other reasons.
    const cancelledAt = original.cancellation?.at ?? original.updatedAt;
    if (Date.now() - new Date(cancelledAt).getTime() > cfg.windowHours * 3_600_000) return 0;

    const gap = replacement.priceBreakdown.total.amount - original.priceBreakdown.total.amount;
    if (gap <= 0) return 0; // the replacement was the same or cheaper

    const covered = Math.min(Math.floor((gap * cfg.coverageBps) / 10000), cfg.maxCoverageCents);
    if (covered <= 0) return 0;

    const currency = replacement.priceBreakdown.total.currency;
    await ledgerService.post({
      refType: 'rebooking_protection',
      refId: replacement._id,
      currency,
      description: `Rebooking guarantee: covered the difference after a host cancellation (${original.code})`,
      legs: [
        { account: Account.guaranteeExpense(), direction: 'debit', amount: covered },
        { account: Account.userWallet(original.guestId), direction: 'credit', amount: covered },
      ],
    });

    await BookingModel.updateOne(
      { _id: replacement._id },
      { rebookedFrom: original._id, coveredDifference: { amount: covered, currency } },
    );

    // Only claim they paid nothing extra when that is actually true — the cap
    // means a very large gap is covered in part, and saying otherwise would be
    // the kind of promise that turns into a support ticket.
    const fullyCovered = covered >= gap;
    await notificationService.send({
      userId: original.guestId,
      priority: 'high',
      deepLink: `/bookings/${replacement._id}`,
      templateKey: 'booking.rebooking_covered',
      title: fullyCovered ? 'We covered the difference' : 'We covered most of the difference',
      body: fullyCovered
        ? `Your replacement car cost more, so we credited the ${formatMinor(covered, currency)} difference to your wallet. You paid what you originally booked.`
        : `Your replacement car cost ${formatMinor(gap, currency)} more. We credited ${formatMinor(covered, currency)} to your wallet — the most our guarantee covers on one trip.`,
      data: { bookingId: replacement._id, covered, gap, fullyCovered },
    });
    logger.info({ original: original._id, replacement: replacement._id, covered }, 'rebooking guarantee applied');
    return covered;
  }

  /**
   * Charge a host for cancelling a confirmed trip.
   *
   * Without a cost, cancelling is free for the host and expensive for everyone
   * else — the guest is stranded and the platform funds the rebooking. The
   * penalty is deducted from the host's payable balance (so it settles against
   * their next payout rather than needing a separate charge), and the first few
   * cancellations in the window are forgiven because genuine emergencies happen.
   */
  private async chargeHostCancellationPenalty(booking: BookingDoc): Promise<void> {
    const { hostPenalty } = (await platformConfigService.get()).rebookingProtection;
    if (!hostPenalty.enabled) return;

    const since = new Date(Date.now() - hostPenalty.graceWindowDays * 86_400_000);
    const priorCancellations = await BookingModel.countDocuments({
      hostId: booking.hostId,
      status: 'cancelled_host',
      _id: { $ne: booking._id },
      updatedAt: { $gte: since },
    });
    if (priorCancellations < hostPenalty.graceCancellations) {
      logger.info(
        { hostId: booking.hostId, priorCancellations },
        'host cancellation within the forgiven allowance — no penalty',
      );
      return;
    }

    const total = booking.priceBreakdown.total.amount;
    const penalty = hostPenalty.flatCents + Math.floor((total * hostPenalty.pctOfBookingBps) / 10000);
    if (penalty <= 0) return;

    const currency = booking.priceBreakdown.total.currency;
    await ledgerService.post({
      refType: 'host_cancellation_penalty',
      refId: booking._id,
      currency,
      description: `Host cancellation penalty (${booking.code})`,
      legs: [
        { account: Account.hostPayable(booking.hostId), direction: 'debit', amount: penalty },
        { account: Account.guaranteeExpense(), direction: 'credit', amount: penalty },
      ],
    });

    await this.notifyHostOfPenalty(booking.hostId, penalty, currency, booking.code);
    logger.info({ hostId: booking.hostId, bookingId: booking._id, penalty }, 'host cancellation penalty charged');
  }

  private async notifyHostOfPenalty(hostId: string, penalty: number, currency: string, code: string): Promise<void> {
    try {
      const host = await hostService.getById(hostId);
      await notificationService.send({
        userId: host.userId,
        priority: 'high',
        templateKey: 'booking.host_cancellation_penalty',
        title: 'Cancellation fee applied',
        body: `Cancelling ${code} left your guest without a car, so a ${formatMinor(penalty, currency)} fee was deducted from your next payout. Cancellations also affect your All-Star status.`,
        data: { hostId, penalty },
      });
    } catch (err) {
      logger.warn({ err, hostId }, 'host penalty notification failed');
    }
  }

  /**
   * What a cancellation would refund, right now, without cancelling.
   *
   * Turo shows the exact figure before you commit; "your refund depends on the
   * policy" is not good enough at the moment a guest is deciding whether to
   * eat a loss. Read-only and deterministic — the same call a second later
   * only changes once a policy threshold is crossed.
   */
  async cancellationPreview(
    principal: Principal,
    bookingId: string,
  ): Promise<{
    total: Money;
    refund: Money;
    nonRefundable: Money;
    policy: 'flexible' | 'moderate' | 'strict';
    fullRefundUntil: string | null;
    isFullRefund: boolean;
    cancellable: boolean;
    /** For a host viewer: what cancelling costs them, beyond the guest refund. */
    hostPenalty?: { affectsStanding: boolean; note: string };
  }> {
    const booking = await this.getDoc(bookingId);
    const isGuest = booking.guestId === principal.userId;
    const isHost = await this.isHostOwner(principal.userId, booking.hostId);
    const isAdmin =
      principal.permissions.includes('booking:read:any') || principal.permissions.includes('*');
    if (!isGuest && !isHost && !isAdmin) throw new ForbiddenError('Cannot view this booking');

    const total = booking.priceBreakdown.total;
    const cancellable = ['pending_verification', 'pending_approval', 'confirmed', 'paid'].includes(
      booking.status,
    );

    // A host or admin cancellation is always a full refund — only a guest
    // cancellation is policy-bound, so that is what the preview reflects for a
    // guest. For a host viewing, show the full refund the guest would receive.
    const cancelCfg = (await platformConfigService.get()).cancellation;
    const refund =
      isGuest && (booking.status === 'paid' || booking.status === 'confirmed')
        ? computeRefund(booking.cancellationPolicy, total, booking.period.start, cancelCfg)
        : { ...total };

    const hoursFull = cancelCfg[booking.cancellationPolicy].fullBeforeHours;
    const fullRefundUntil = new Date(
      booking.period.start.getTime() - hoursFull * 3_600_000,
    );

    return {
      total,
      refund,
      nonRefundable: { amount: total.amount - refund.amount, currency: total.currency },
      policy: booking.cancellationPolicy,
      // Null once the window has already passed — there is no future moment
      // that still earns a full refund.
      fullRefundUntil: fullRefundUntil.getTime() > Date.now() ? fullRefundUntil.toISOString() : null,
      isFullRefund: refund.amount === total.amount,
      cancellable,
      // A host cancelling a confirmed trip strands a guest — the platform's
      // most damaging event — so it always carries a standing penalty. Shown
      // to the host before they commit, the way Turo warns hosts hard.
      hostPenalty:
        isHost && ['confirmed', 'paid'].includes(booking.status)
          ? {
              affectsStanding: true,
              note: 'Cancelling a confirmed trip lowers your acceptance rate and can cost your All-Star status. Repeated host cancellations lead to review.',
            }
          : undefined,
    };
  }

  /** The cost and feasibility of an extension, from the same plan requestExtension runs, without charging. */
  async extensionPreview(
    userId: string,
    bookingId: string,
    newEndIso: string,
  ): Promise<{
    available: boolean;
    reason?: string;
    extraCost?: Money;
    newEnd: string;
    days?: number;
    swap?: { possible: true; vehicle: { id: string; make: string; model: string; year: number } };
  }> {
    const booking = await this.getDoc(bookingId);
    if (booking.guestId !== userId) throw new ForbiddenError('Only the guest can extend');

    const plan = await this.planExtension(booking, newEndIso);
    if (!plan.ok) return { available: false, reason: plan.reason, newEnd: plan.newEnd?.toISOString() ?? newEndIso };

    const base = { extraCost: plan.extra.total, days: plan.days, newEnd: plan.newEnd.toISOString() };
    if (!plan.swap) return { available: true, ...base };
    const { candidate } = plan.swap.options[0];
    return {
      available: false,
      reason: 'The car is booked for some of those days, but we can arrange the extension for you.',
      swap: { possible: true, vehicle: { id: candidate._id, make: candidate.make, model: candidate.model, year: candidate.year } },
      ...base,
    };
  }

  async requestExtension(userId: string, bookingId: string, newEndIso: string): Promise<BookingDoc> {
    const booking = await this.getDoc(bookingId);
    if (booking.guestId !== userId) throw new ForbiddenError('Only the guest can extend');

    const plan = await this.planExtension(booking, newEndIso);
    if (!plan.ok) {
      if (['INVALID_DATE', 'TOO_SHORT', 'EXTENSION_TOO_LONG'].includes(plan.code)) throw new ValidationError(plan.reason);
      throw new ConflictError(plan.reason, plan.code);
    }
    const swap = plan.swap;
    if (!swap) return this.commitExtension(booking, plan, userId);

    return this.moveVehicle(swap, { extenderBookingId: bookingId, extensionEarnings: plan.extra.hostEarnings }, (chosen) =>
      this.commitExtension(booking, plan, userId, { movedBookingId: swap.blocker._id, toVehicleId: chosen.candidate._id }),
    );
  }

  /** Everything decided before any money or calendar row moves: rules, days, conflicts, price, swap. */
  private async planExtension(booking: BookingDoc, newEndIso: string): Promise<ExtensionPlan> {
    const cfg = (await platformConfigService.get()).extension;
    const newEnd = new Date(newEndIso);
    const fail = (code: string, reason: string): ExtensionPlan => ({
      ok: false,
      code,
      reason,
      newEnd: isNaN(newEnd.getTime()) ? null : newEnd,
    });

    if (!cfg.enabled) return fail('EXTENSIONS_DISABLED', 'Trip extensions are not available right now.');
    if (!['paid', 'in_progress'].includes(booking.status)) {
      return fail('INVALID_STATE', 'Only an active trip can be extended.');
    }
    if (isNaN(newEnd.getTime()) || newEnd <= booking.period.end) {
      return fail('INVALID_DATE', 'Pick a date after your current trip end.');
    }
    // Extra days are whole calendar days, the same keys the availability calendar uses.
    const extraStart = dayAfter(booking.period.end);
    if (newEnd < extraStart) return fail('TOO_SHORT', 'Extend by at least one more calendar day.');
    const days = dayKeys(extraStart, newEnd).length;
    if (days > cfg.maxDays) {
      return fail('EXTENSION_TOO_LONG', `You can extend by up to ${cfg.maxDays} day${cfg.maxDays === 1 ? '' : 's'} at a time.`);
    }

    const blockers = await availabilityService.blockingRows(booking.vehicleId, extraStart, newEnd, { excludeBookingId: booking._id });
    let swap: SwapPlan | undefined;
    if (blockers.length > 0) {
      swap = (await this.findSwap(booking, blockers, cfg)) ?? undefined;
      if (!swap) {
        const states = new Set(blockers.map((r) => r.state));
        return fail(
          'NOT_AVAILABLE',
          states.has('blocked')
            ? 'The host has blocked those days.'
            : states.has('booked')
              ? 'Another guest has this car booked for those days.'
              : 'Someone is checking out on this car for those days. Try again in a few minutes.',
        );
      }
    }

    const extra = await pricingService.quote({
      vehicleId: booking.vehicleId,
      start: extraStart,
      end: newEnd,
      protectionPlan: booking.priceBreakdown.protectionPlan,
      guestId: booking.guestId, // membership benefits apply to the extra days too
      skipOneTimeFees: true,
    });
    return { ok: true, newEnd, extraStart, days, extra, swap };
  }

  /** Hold the days, take the money, and only then grant them. */
  private async commitExtension(
    booking: BookingDoc,
    plan: { newEnd: Date; extraStart: Date; days: number; extra: PriceBreakdown },
    userId: string,
    swap?: { movedBookingId: string; toVehicleId: string },
  ): Promise<BookingDoc> {
    const { newEnd, extra } = plan;
    const bookingId = booking._id;
    const holdId = await availabilityService.placeHold(booking.vehicleId, plan.extraStart, newEnd);
    try {
      const extensionKey = `${bookingId}-ext-${newEnd.getTime()}`;
      const charge = await paymentService.chargeForBooking({
        bookingId,
        guestId: booking.guestId,
        hostId: booking.hostId,
        capture: true,
        total: extra.total,
        ...this.paymentSplit(extra),
        idempotencyKey: extensionKey,
      });
      // Extra days are only granted for money that actually moved.
      if (charge.status !== 'succeeded') {
        await paymentService.cancelByKey(extensionKey).catch(() => undefined);
        throw new ConflictError('The payment for the extra days did not go through. Check your card and try again.', 'PAYMENT_INCOMPLETE');
      }
      await availabilityService.confirmHold(holdId, bookingId);

      const receiptNo = `${booking.code}-R${(booking.extensions?.length ?? 0) + 1}`;
      const at = new Date();
      // $inc keeps the roll-up exact, and every additive part is rolled in so the totals still sum.
      await BookingModel.updateOne(
        { _id: bookingId },
        {
          $set: { 'period.end': newEnd },
          $inc: {
            'priceBreakdown.total.amount': extra.total.amount,
            'priceBreakdown.hostEarnings.amount': extra.hostEarnings.amount,
            'priceBreakdown.commission.amount': extra.commission.amount,
            'priceBreakdown.tax.amount': extra.tax.amount,
            'priceBreakdown.base.amount': extra.base.amount,
            'priceBreakdown.subtotal.amount': extra.subtotal.amount,
            'priceBreakdown.discount.amount': extra.discount.amount,
            'priceBreakdown.cleaningFee.amount': extra.cleaningFee.amount,
            'priceBreakdown.protection.amount': extra.protection.amount,
            'priceBreakdown.taxTotal.amount': extra.taxTotal?.amount ?? 0,
            'priceBreakdown.days': extra.days,
          },
          $push: {
            statusHistory: { from: booking.status, to: booking.status, at, by: userId, reason: `Extended to ${newEnd.toISOString()}` },
            extensions: {
              _id: uuid(),
              prevEnd: booking.period.end,
              newEnd,
              days: extra.days,
              total: extra.total,
              hostEarnings: extra.hostEarnings,
              commission: extra.commission,
              tax: extra.tax,
              parts: {
                base: extra.base.amount,
                discount: extra.discount.amount,
                cleaningFee: extra.cleaningFee.amount,
                protection: extra.protection.amount,
                subtotal: extra.subtotal.amount,
                taxTotal: extra.taxTotal?.amount ?? 0,
              },
              paymentId: charge.paymentId,
              receiptNo,
              createdAt: at,
              ...(swap ? { swap } : {}),
            },
          },
        },
      );
      emit(EVENTS.BOOKING_EXTENDED, bookingId, {
        bookingId,
        guestId: booking.guestId,
        hostId: booking.hostId,
        newEnd,
        days: extra.days,
        receiptNo,
        total: extra.total,
        hostEarnings: extra.hostEarnings,
      });
      return this.getDoc(bookingId);
    } catch (err) {
      await availabilityService.releaseHold(holdId);
      throw err;
    }
  }

  /** Split a quote into payment legs that sum to the total: protection and service fee ride in commission, rental tax in tax. */
  private paymentSplit(b: PriceBreakdown): { hostEarnings: Money; commission: Money; tax: Money } {
    const currency = b.currency;
    return {
      hostEarnings: b.hostEarnings,
      commission: { amount: b.commission.amount + b.protection.amount + (b.serviceFee?.amount ?? 0), currency },
      tax: { amount: b.tax.amount + (b.taxTotal?.amount ?? 0), currency },
    };
  }

  /** A comparable car for the one paid, unstarted booking in the way, or null when no swap is allowed. */
  private async findSwap(
    booking: BookingDoc,
    blockers: BlockingRow[],
    cfg: { swapPolicy: 'auto' | 'off'; swapPriceToleranceBps: number; swapMaxAbsorbCents: number },
  ): Promise<SwapPlan | null> {
    if (cfg.swapPolicy !== 'auto') return null;
    // One booked blocker and nothing else: never a host block, a checkout hold, or a pile-up.
    if (blockers.some((r) => r.state !== 'booked' || !r.bookingId)) return null;
    const ids = new Set(blockers.map((r) => r.bookingId!));
    if (ids.size !== 1) return null;

    const blocker = await BookingModel.findOne({ _id: [...ids][0], deletedAt: null }).lean<BookingDoc>();
    if (
      !blocker ||
      blocker.status !== 'paid' ||
      blocker.tripId ||
      blocker.guestId === booking.guestId ||
      blocker.vehicleId !== booking.vehicleId ||
      blocker.period.start.getTime() <= Date.now() ||
      blocker.delivery ||
      (blocker.extensions?.length ?? 0) > 0
    ) {
      return null;
    }

    // One settled card payment, so re-splitting it is a single, exact ledger move.
    const payments = await PaymentModel.find({ bookingId: blocker._id, type: 'booking' }).lean();
    const [payment] = payments;
    if (payments.length !== 1 || payment.status !== 'succeeded' || !payment.ledgerTxnId || payment.refundedAmount > 0) return null;
    const paid = payment.amount;

    const pb = blocker.priceBreakdown;
    const addOnCodes = (pb.selectedAddOns ?? []).map((a) => a.code);
    const candidates = await searchService.similarTo(blocker.vehicleId, {
      start: blocker.period.start,
      end: blocker.period.end,
      limit: 12,
    });

    const options = (
      await Promise.all(
        candidates.map(async (candidate): Promise<SwapOption | null> => {
          try {
            const v = await vehicleService.getForBooking(candidate._id);
            const hours = (blocker.period.end.getTime() - blocker.period.start.getTime()) / 3_600_000;
            if (!v.bookable || !v.instantBook || hours < v.minTripHours || hours > v.maxTripHours) return null;
            if (await documentComplianceService.hasExpiredMandatoryDoc(candidate._id)) return null;
            if (!(await vehicleLifecycleService.isOperableForBooking(candidate._id))) return null;

            const quote = await pricingService.quote({
              vehicleId: candidate._id,
              start: blocker.period.start,
              end: blocker.period.end,
              guestId: blocker.guestId,
              protectionPlan: pb.protectionPlan,
              addOnCodes,
            });
            if ((quote.selectedAddOns?.length ?? 0) !== addOnCodes.length) return null; // never drop what they paid for
            const diff = quote.total.amount - paid;
            if (Math.abs(diff) * 10_000 > paid * cfg.swapPriceToleranceBps) return null;
            if (diff > cfg.swapMaxAbsorbCents) return null;
            return { candidate, quote, absorb: Math.max(0, diff) };
          } catch {
            return null; // one unusable car must not sink the rest
          }
        }),
      )
    ).filter((o): o is SwapOption => o !== null);
    if (options.length === 0) return null;

    // The car that costs the platform least first; search order (category, rating) breaks ties.
    options.sort((a, b) => a.absorb - b.absorb);
    return { blocker, payment, paid, options };
  }

  /** Hold the new car, free the old days, run `extend`; if it fails, restore the old days and release the hold. */
  private async moveVehicle<T>(
    plan: SwapPlan,
    ctx: { extenderBookingId: string; extensionEarnings: Money },
    extend: (chosen: SwapOption) => Promise<T>,
  ): Promise<T> {
    const { blocker } = plan;
    let chosen: SwapOption | null = null;
    let holdId = '';
    for (const option of plan.options) {
      try {
        holdId = await availabilityService.placeHold(option.candidate._id, blocker.period.start, blocker.period.end);
        chosen = option;
        break;
      } catch (err) {
        if ((err as { code?: string }).code !== 'NOT_AVAILABLE') throw err;
      }
    }
    if (!chosen) throw new ConflictError('Vehicle is not available for the extended dates', 'NOT_AVAILABLE');

    let detached: AvailabilityDoc[];
    try {
      detached = await availabilityService.detachBooking(blocker._id);
    } catch (err) {
      await availabilityService.releaseHold(holdId);
      throw err;
    }

    let result: T;
    try {
      result = await extend(chosen);
    } catch (err) {
      try {
        await availabilityService.restoreRows(detached);
      } catch (restoreErr) {
        logger.error({ err: restoreErr, bookingId: blocker._id }, 'could not restore the moved guest days after a failed extension');
        emit(EVENTS.BOOKING_SWAP_FAILED, blocker._id, {
          bookingId: blocker._id,
          extenderBookingId: ctx.extenderBookingId,
          stage: 'restore_days',
          error: (restoreErr as Error).message,
        });
      }
      await availabilityService.releaseHold(holdId);
      throw err;
    }

    await this.finalizeSwap(plan, chosen, holdId, ctx);
    return result;
  }

  /** Make the move true everywhere after the extension is paid; never throws, failures go to staff. */
  private async finalizeSwap(
    plan: SwapPlan,
    chosen: SwapOption,
    holdId: string,
    ctx: { extenderBookingId: string; extensionEarnings: Money },
  ): Promise<void> {
    const { blocker, payment, paid } = plan;
    const { candidate, quote } = chosen;
    const at = new Date();
    try {
      await availabilityService.confirmHold(holdId, blocker._id);

      const split = this.paymentSplit(quote);
      const newEarnings = split.hostEarnings.amount;
      const newTax = split.tax.amount;
      // What the old legs put back, so the re-class balances by construction.
      const settled = payment.hostEarnings + payment.commission + payment.tax;
      const newRevenue = settled - newEarnings - newTax;
      const shortfall = Math.max(0, -newRevenue);
      const revenue = Math.max(0, newRevenue);

      await BookingModel.updateOne(
        { _id: blocker._id },
        {
          $set: {
            vehicleId: candidate._id,
            hostId: candidate.hostId,
            'priceBreakdown.hostEarnings.amount': quote.hostEarnings.amount,
            'priceBreakdown.commission.amount': quote.commission.amount,
            'priceBreakdown.tax.amount': quote.tax.amount,
            swap: {
              fromVehicleId: blocker.vehicleId,
              fromHostId: blocker.hostId,
              toVehicleId: candidate._id,
              toHostId: candidate.hostId,
              reason: 'extension',
              at,
              extendedByBookingId: ctx.extenderBookingId,
            },
          },
          $inc: { version: 1 },
          $push: {
            statusHistory: {
              from: blocker.status,
              to: blocker.status,
              at,
              by: 'system',
              reason: 'Moved to a similar car so another guest could extend their trip',
            },
          },
        },
      );

      await PaymentModel.updateMany(
        { bookingId: blocker._id, type: 'booking' },
        { $set: { hostId: candidate.hostId, hostEarnings: newEarnings, commission: revenue, tax: newTax } },
      );

      const legs: LedgerLeg[] = [
        { account: Account.hostPayable(blocker.hostId), direction: 'credit', amount: payment.hostEarnings },
        { account: Account.platformRevenue(), direction: 'credit', amount: payment.commission },
        { account: Account.platformTax(), direction: 'credit', amount: payment.tax },
        { account: Account.hostPayable(candidate.hostId), direction: 'debit', amount: newEarnings },
        { account: Account.platformTax(), direction: 'debit', amount: newTax },
        { account: Account.platformRevenue(), direction: 'debit', amount: revenue },
        // The platform absorbs what the new car's split needs beyond what the guest paid.
        { account: Account.guaranteeExpense(), direction: 'credit', amount: shortfall },
      ];
      await ledgerService.post({
        txnId: `swap_${blocker._id}_${candidate._id}`,
        refType: 'booking_swap',
        refId: blocker._id,
        currency: payment.currency,
        description: `Booking ${blocker.code} moved to a similar car for another guest's extension`,
        legs: legs.filter((l) => l.amount > 0),
      });

      emit(EVENTS.BOOKING_SWAPPED, blocker._id, {
        bookingId: blocker._id,
        guestId: blocker.guestId,
        fromVehicleId: blocker.vehicleId,
        fromHostId: blocker.hostId,
        toVehicleId: candidate._id,
        toHostId: candidate.hostId,
        extendedByBookingId: ctx.extenderBookingId,
        extensionEarnings: ctx.extensionEarnings,
        paid,
        absorbed: chosen.absorb,
      });
    } catch (err) {
      logger.error({ err, bookingId: blocker._id }, 'booking swap could not be finalised');
      emit(EVENTS.BOOKING_SWAP_FAILED, blocker._id, {
        bookingId: blocker._id,
        extenderBookingId: ctx.extenderBookingId,
        toVehicleId: candidate._id,
        stage: 'finalize',
        error: (err as Error).message,
      });
    }
  }

  /** The original receipt plus one per extension, each summing to its own total; access follows `get`. */
  async receipts(principal: Principal, bookingId: string): Promise<BookingReceipts> {
    return this.buildReceipts(await this.get(principal, bookingId), true);
  }

  private async buildReceipts(b: BookingDoc, withPaymentRefs: boolean): Promise<BookingReceipts> {
    const pb = b.priceBreakdown;
    const cur = pb.currency;
    const exts = b.extensions ?? [];
    const sum = (pick: (e: BookingExtension) => number) => exts.reduce((s, e) => s + pick(e), 0);

    const refs = new Map<string, string>();
    if (withPaymentRefs) {
      const ids = [b.paymentId, ...exts.map((e) => e.paymentId)].filter((x): x is string => !!x);
      const rows = await PaymentModel.find({ _id: { $in: ids } }, { intentId: 1 }).lean<{ _id: string; intentId: string }[]>();
      for (const r of rows) refs.set(String(r._id), r.intentId);
    }

    const lines = (
      label: string,
      parts: { base: number; discount: number; cleaningFee: number; protection: number; delivery?: number; addOns?: { label: string; amount: number }[] },
      total: number,
      protectionPlan?: string,
    ): ReceiptLine[] => {
      const out: ReceiptLine[] = [{ label, amount: parts.base }];
      if (parts.cleaningFee) out.push({ label: 'Cleaning fee', amount: parts.cleaningFee });
      if (parts.delivery) out.push({ label: 'Delivery', amount: parts.delivery });
      for (const a of parts.addOns ?? []) out.push({ label: a.label, amount: a.amount });
      if (parts.protection) out.push({ label: `Protection${protectionPlan ? ` · ${protectionPlan}` : ''}`, amount: parts.protection });
      if (parts.discount) out.push({ label: 'Discounts', amount: -parts.discount });
      // Whatever else was charged (service fee, rental tax), so the lines always add up to the total.
      const rest = total - out.reduce((s, l) => s + l.amount, 0);
      if (rest !== 0) out.push({ label: 'Service fee & taxes', amount: rest });
      return out;
    };

    const originalTotal = pb.total.amount - sum((e) => e.total.amount);
    const originalDays = pb.days - sum((e) => e.days);
    const addOns = (pb.selectedAddOns ?? []).map((a) => ({ label: a.label, amount: a.amount.amount }));
    const receipts: Receipt[] = [
      {
        receiptNo: `${b.code}-R0`,
        kind: 'original',
        issuedAt: b.createdAt,
        period: { start: b.period.start, end: exts[0]?.prevEnd ?? b.period.end },
        days: originalDays,
        lines: lines(
          `Rental · ${originalDays} day${originalDays === 1 ? '' : 's'}`,
          {
            base: (pb.base?.amount ?? 0) - sum((e) => e.parts.base),
            discount: (pb.discount?.amount ?? 0) - sum((e) => e.parts.discount),
            cleaningFee: (pb.cleaningFee?.amount ?? 0) - sum((e) => e.parts.cleaningFee),
            protection: (pb.protection?.amount ?? 0) - sum((e) => e.parts.protection),
            delivery: pb.delivery?.amount ?? 0,
            addOns,
          },
          originalTotal,
          pb.protectionPlan,
        ),
        total: { amount: originalTotal, currency: cur },
        paymentRef: b.paymentId ? refs.get(b.paymentId) : undefined,
      },
      ...exts.map(
        (e): Receipt => ({
          receiptNo: e.receiptNo,
          kind: 'extension',
          extensionId: e._id,
          issuedAt: e.createdAt,
          period: { start: e.prevEnd, end: e.newEnd },
          days: e.days,
          lines: lines(`Extension · ${e.days} day${e.days === 1 ? '' : 's'}`, e.parts, e.total.amount, pb.protectionPlan),
          total: e.total,
          paymentRef: refs.get(e.paymentId),
        }),
      ),
    ];

    return {
      bookingId: b._id,
      code: b.code,
      currency: cur,
      receipts,
      summary: { period: b.period, days: pb.days, total: pb.total },
    };
  }

  /**
   * What shortening a trip to an earlier end date refunds, before committing.
   * Mirrors extensionPreview: the released tail is priced on its own — the same
   * way the extra days are when extending — rather than re-quoting the whole
   * trip, so a length discount isn't retroactively reshuffled.
   */
  async shortenPreview(
    userId: string,
    bookingId: string,
    newEndIso: string,
  ): Promise<{ available: boolean; reason?: string; refund?: Money; newEnd: string }> {
    const booking = await this.getDoc(bookingId);
    if (booking.guestId !== userId) throw new ForbiddenError('Only the guest can shorten');

    const newEnd = new Date(newEndIso);
    if (isNaN(newEnd.getTime()) || newEnd >= booking.period.end) {
      return { available: false, reason: 'Pick a date before your current trip end.', newEnd: newEndIso };
    }
    if (booking.status !== 'paid') {
      return { available: false, reason: 'Only a confirmed trip that has not started can be shortened.', newEnd: newEndIso };
    }
    if (booking.period.start <= new Date()) {
      return { available: false, reason: 'The trip has already started and cannot be shortened.', newEnd: newEnd.toISOString() };
    }
    const vehicle = await vehicleService.getForBooking(booking.vehicleId);
    if ((newEnd.getTime() - booking.period.start.getTime()) / 3_600_000 < vehicle.minTripHours) {
      return { available: false, reason: `Trips on this car must be at least ${vehicle.minTripHours} hours.`, newEnd: newEnd.toISOString() };
    }

    const removedStart = new Date(newEnd.getTime() + 86_400_000);
    const removed = await pricingService.quote({ vehicleId: booking.vehicleId, start: removedStart, end: booking.period.end, skipOneTimeFees: true });
    return { available: true, refund: removed.total, newEnd: newEnd.toISOString() };
  }

  async requestShorten(userId: string, bookingId: string, newEndIso: string): Promise<BookingDoc> {
    const booking = await this.getDoc(bookingId);
    if (booking.guestId !== userId) throw new ForbiddenError('Only the guest can shorten');
    if (booking.status !== 'paid') {
      throw new ConflictError('Only a confirmed trip that has not started can be shortened', 'INVALID_STATE');
    }
    if (booking.period.start <= new Date()) {
      throw new ConflictError('The trip has already started', 'INVALID_STATE');
    }
    const newEnd = new Date(newEndIso);
    if (isNaN(newEnd.getTime()) || newEnd >= booking.period.end) {
      throw new ValidationError('New end must be before the current end');
    }
    const vehicle = await vehicleService.getForBooking(booking.vehicleId);
    if ((newEnd.getTime() - booking.period.start.getTime()) / 3_600_000 < vehicle.minTripHours) {
      throw new ValidationError(`Minimum trip length is ${vehicle.minTripHours} hours`);
    }

    // Price only the released tail, refund it, and free those days for others.
    const removedStart = new Date(newEnd.getTime() + 86_400_000);
    const removed = await pricingService.quote({ vehicleId: booking.vehicleId, start: removedStart, end: booking.period.end, skipOneTimeFees: true });
    if (removed.total.amount > 0) {
      await paymentService.refundBooking(bookingId, removed.total, `Trip shortened to ${newEnd.toISOString()}`);
    }
    await availabilityService.releaseRange(bookingId, removedStart, booking.period.end);

    // Roll the reduction into the booking totals so the host is paid for the
    // days actually kept, not the ones given back.
    const pb = booking.priceBreakdown;
    await BookingModel.updateOne(
      { _id: bookingId },
      {
        $set: {
          'period.end': newEnd,
          'priceBreakdown.total.amount': Math.max(0, pb.total.amount - removed.total.amount),
          'priceBreakdown.hostEarnings.amount': Math.max(0, pb.hostEarnings.amount - removed.hostEarnings.amount),
          'priceBreakdown.commission.amount': Math.max(0, pb.commission.amount - removed.commission.amount),
          'priceBreakdown.tax.amount': Math.max(0, pb.tax.amount - removed.tax.amount),
          'priceBreakdown.days': Math.max(1, pb.days - removed.days),
        },
        $push: {
          statusHistory: { from: booking.status, to: booking.status, at: new Date(), by: userId, reason: `Shortened to ${newEnd.toISOString()}` },
        },
      },
    );
    emit(EVENTS.BOOKING_SHORTENED, bookingId, { bookingId, guestId: booking.guestId, hostId: booking.hostId, newEnd });
    return this.getDoc(bookingId);
  }

  async get(principal: Principal, bookingId: string): Promise<BookingDoc> {
    const booking = await this.getDoc(bookingId);
    const isParticipant =
      booking.guestId === principal.userId || (await this.isHostOwner(principal.userId, booking.hostId));
    const isAdmin = principal.permissions.includes('booking:read:any') || principal.permissions.includes('*');
    if (!isParticipant && !isAdmin) throw new ForbiddenError('Not your booking');
    return booking;
  }

  async listForGuest(guestId: string, cursorRaw?: string, limit = 20): Promise<Page<BookingDoc>> {
    const cursor = decodeCursor(cursorRaw);
    const rows = await BookingModel.find({ guestId, deletedAt: null, ...cursorFilter(cursor) })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean<BookingDoc[]>();
    return toPage(rows, limit);
  }

  async listForHost(userId: string, cursorRaw?: string, limit = 20): Promise<Page<BookingDoc>> {
    const host = await hostService.requireHostForUser(userId);
    const cursor = decodeCursor(cursorRaw);
    const rows = await BookingModel.find({ hostId: host._id, deletedAt: null, ...cursorFilter(cursor) })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean<BookingDoc[]>();
    return toPage(rows, limit);
  }

  /**
   * Cron: expire requests nobody acted on.
   *
   * Two clocks. A host has 24h to answer a request (`approvalDeadline`). A
   * guest has 72h to clear identity — longer, because a manual document review
   * can legitimately take a day, and their money is only authorised, not taken.
   */
  async expirePending(): Promise<number> {
    const now = new Date();
    const { booking: bookingCfg } = await platformConfigService.get();
    const verificationCutoff = new Date(now.getTime() - bookingCfg.verificationGraceHours * HOUR_MS);
    const paymentCutoff = new Date(now.getTime() - bookingCfg.paymentPendingMinutes * 60_000);
    const verificationDeadline = new Date(now.getTime() + bookingCfg.verificationCutoffHours * HOUR_MS);
    const due = await BookingModel.find({
      $or: [
        { status: 'pending_approval', approvalDeadline: { $lte: now } },
        { status: 'pending_verification', createdAt: { $lte: verificationCutoff } },
        // A held request whose trip has already started is dead regardless of
        // which clock it was on — nobody can take a car they missed.
        // Unverified this close to pickup: the host can't be left waiting on a
        // guest who may never clear the licence check.
        { status: 'pending_verification', 'period.start': { $lte: verificationDeadline } },
        { status: 'pending_payment', createdAt: { $lte: paymentCutoff } },
        { status: 'pending_payment', 'period.start': { $lte: now } },
      ],
    }).lean<BookingDoc[]>();
    for (const b of due) {
      try {
        await paymentService.cancelAuthorization(b._id);
        if (b.holdId) await availabilityService.releaseHold(b.holdId);
        const doc = await this.getDoc(b._id);
        await this.transition(doc, 'expired', 'system', 'Approval window elapsed');
      } catch (err) {
        // One stuck booking must not stop the rest of the sweep.
        logger.error({ err, bookingId: b._id }, 'could not expire booking');
        continue;
      }
      // Carry the parties, so the guest can actually be told their request
      // lapsed rather than discovering it on their next visit.
      emit(EVENTS.BOOKING_EXPIRED, b._id, {
        bookingId: b._id,
        guestId: b.guestId,
        hostId: b.hostId,
        vehicleId: b.vehicleId,
        reason:
          b.status === 'pending_verification'
            ? 'verification'
            : b.status === 'pending_payment'
              ? 'payment'
              : 'no_response',
      });
    }
    return due.length;
  }

  /**
   * The money for a booking parked as pending_payment has landed (3-D Secure
   * finished, or a card was entered later). Confirms it once; any other state
   * means it was already handled, cancelled or expired, so this does nothing.
   */
  async confirmAfterPayment(bookingId: string): Promise<void> {
    const booking = await this.getDoc(bookingId);
    if (booking.status !== 'pending_payment') return;

    // The checkout hold is short. If it lapsed the dates may be gone, and taking
    // the trip anyway would double-book the car — give the money back instead.
    if (booking.holdId && !(await availabilityService.holdExists(booking.holdId))) {
      try {
        booking.holdId = await availabilityService.placeHold(booking.vehicleId, booking.period.start, booking.period.end);
        await BookingModel.updateOne({ _id: bookingId }, { holdId: booking.holdId });
      } catch {
        await paymentService.refundBooking(bookingId, booking.priceBreakdown.total, 'Dates were no longer held');
        await this.transition(booking, 'cancelled_system', 'system', 'Payment arrived after the dates were released');
        emit(EVENTS.BOOKING_CANCELLED, bookingId, {
          bookingId,
          guestId: booking.guestId,
          hostId: booking.hostId,
          cancelledBy: 'system',
          refund: booking.priceBreakdown.total,
        });
        return;
      }
    }
    if (booking.holdId) await availabilityService.confirmHold(booking.holdId, bookingId);
    await this.transition(booking, 'paid', 'system', 'Payment completed');
    emit(EVENTS.BOOKING_CONFIRMED, bookingId, { bookingId, guestId: booking.guestId, hostId: booking.hostId, instant: true });
  }

  /** Guest resumes an unfinished payment; confirms the booking when it clears. */
  async resumePayment(principal: Principal, bookingId: string) {
    const booking = await this.getDoc(bookingId);
    if (booking.guestId !== principal.userId) throw new ForbiddenError('Only the guest can pay for this booking');
    if (booking.status !== 'pending_payment') {
      throw new ConflictError('This booking is not waiting on a payment', 'INVALID_STATE');
    }
    const result = await paymentService.resume(bookingId);
    if (result.status === 'succeeded') await this.confirmAfterPayment(bookingId);
    return result;
  }

  /**
   * A card that cleared at checkout but failed afterwards. Only acts on a
   * booking still waiting on that money — a late or duplicate failure event
   * must never cancel a trip that has since been paid, started or finished.
   */
  async failForPayment(bookingId: string, reason?: string): Promise<boolean> {
    const booking = await this.getDoc(bookingId);
    const UNPAID: BookingStatus[] = ['pending_payment', 'pending_verification', 'pending_approval', 'confirmed'];
    if (!UNPAID.includes(booking.status)) return false;

    if (booking.holdId) await availabilityService.releaseHold(booking.holdId);
    await depositService.release(bookingId, 'Booking payment failed').catch(() => undefined);
    await paymentService.cancelAuthorization(bookingId).catch(() => undefined);
    await this.transition(booking, 'cancelled_system', 'system', reason ?? 'Payment failed');
    return true;
  }

  // Called by the trips module
  async markInProgress(bookingId: string): Promise<void> {
    const b = await this.getDoc(bookingId);
    await this.transition(b, 'in_progress', 'system', 'Trip started');
  }

  async markCompleted(bookingId: string): Promise<void> {
    const b = await this.getDoc(bookingId);
    await this.transition(b, 'completed', 'system', 'Trip completed');
    emit(EVENTS.BOOKING_COMPLETED, bookingId, { bookingId, hostId: b.hostId, guestId: b.guestId });
  }

  async attachTrip(bookingId: string, tripId: string): Promise<void> {
    await BookingModel.updateOne({ _id: bookingId }, { tripId });
  }

  // ── Admin ──────────────────────────────────────────────────────────
  async adminList(opts: { status?: string; limit?: number; skip?: number }): Promise<{
    items: BookingDoc[];
    total: number;
  }> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const filter: Record<string, unknown> = { deletedAt: null };
    if (opts.status) filter.status = opts.status;
    const [items, total] = await Promise.all([
      BookingModel.find(filter).sort({ createdAt: -1 }).skip(opts.skip ?? 0).limit(limit).lean<BookingDoc[]>(),
      BookingModel.countDocuments(filter),
    ]);
    return { items, total };
  }

  /** Admin intervention: force-cancel with a full refund + audit reason. */
  async adminCancel(actorId: string, bookingId: string, reason: string): Promise<BookingDoc> {
    const booking = await this.getDoc(bookingId);
    // pending_payment belongs here as much as pending_verification: it holds
    // the vehicle's dates AND an authorisation on the guest's card, so leaving
    // it uncancellable strands both until it expires.
    const CANCELLABLE = [
      'pending_verification',
      'pending_payment',
      'pending_approval',
      'confirmed',
      'paid',
    ];
    if (!CANCELLABLE.includes(booking.status)) {
      throw new ConflictError('Booking cannot be cancelled in its current state', 'INVALID_STATE');
    }
    const total = booking.priceBreakdown.total;
    let refund = { amount: 0, currency: total.currency };
    if (booking.status === 'paid' || booking.status === 'confirmed') {
      refund = { ...total }; // admin cancellation = full refund
      if (refund.amount > 0) await paymentService.refundBooking(bookingId, refund, reason);
    } else {
      await paymentService.cancelAuthorization(bookingId);
    }
    await availabilityService.releaseBooking(bookingId);
    if (booking.holdId) await availabilityService.releaseHold(booking.holdId);
    await BookingModel.updateOne(
      { _id: bookingId },
      {
        cancellation: {
          by: actorId,
          role: 'admin',
          at: new Date(),
          reason: `[admin] ${reason}`,
          refund,
        },
      },
    );
    await this.transition(booking, 'cancelled_system', actorId, `[admin] ${reason}`);
    emit(EVENTS.BOOKING_CANCELLED, bookingId, {
      bookingId,
      guestId: booking.guestId,
      hostId: booking.hostId,
      refund,
    });
    return this.getDoc(bookingId);
  }

  /** Cron: remind guests of trips starting within 24h (once). */
  async remindUpcoming(): Promise<number> {
    const now = new Date();
    const soon = new Date(now.getTime() + 24 * 3_600_000);
    const due = await BookingModel.find({
      status: 'paid',
      'period.start': { $gte: now, $lte: soon },
      reminderSentAt: { $exists: false },
    }).lean<BookingDoc[]>();
    for (const b of due) {
      emit(EVENTS.BOOKING_REMINDER, b._id, { bookingId: b._id, guestId: b.guestId, start: b.period.start });
      await BookingModel.updateOne({ _id: b._id }, { reminderSentAt: new Date() });
    }
    return due.length;
  }

  /** Cron: warn unverified guests, once, that their licence check is due before pickup. */
  async remindVerification(): Promise<number> {
    const now = new Date();
    const { booking: cfg } = await platformConfigService.get();
    const due = await BookingModel.find({
      status: 'pending_verification',
      'period.start': { $lte: new Date(now.getTime() + cfg.verificationReminderHours * HOUR_MS), $gt: now },
      verificationReminderSentAt: { $exists: false },
    }).lean<BookingDoc[]>();
    for (const b of due) {
      const deadline = new Date(b.period.start.getTime() - cfg.verificationCutoffHours * HOUR_MS);
      emit(EVENTS.BOOKING_REMINDER, b._id, { bookingId: b._id, guestId: b.guestId, start: b.period.start, kind: 'verification', deadline });
      await BookingModel.updateOne({ _id: b._id }, { verificationReminderSentAt: new Date() });
    }
    return due.length;
  }

  /**
   * Cron: watch the two ways a paid trip goes quiet — a pickup nobody did, and
   * a return nobody made. Each stage fires once per booking, and the final one
   * reaches ops, because a car that has not come back is theirs to chase.
   */
  async sweepLifecycle(): Promise<{ late: number; escalated: number; notStarted: number }> {
    const now = Date.now();
    const cfg = await platformConfigService.get();
    const graceMs = (cfg.tracking?.overdueGraceMinutes ?? 60) * 60_000;
    const stage = async (
      filter: Record<string, unknown>,
      marker: 'overdueNotifiedAt' | 'overdueEscalatedAt' | 'notStartedNotifiedAt',
      kind: 'late' | 'escalated' | 'never_started',
    ) => {
      const due = await BookingModel.find({ ...filter, [marker]: { $exists: false } }).lean<BookingDoc[]>();
      for (const b of due) {
        // Marked first: a crash after this can only skip a nudge, never repeat one.
        await BookingModel.updateOne({ _id: b._id }, { [marker]: new Date() });
        emit(EVENTS.BOOKING_OVERDUE, b._id, { bookingId: b._id, guestId: b.guestId, hostId: b.hostId, stage: kind });
      }
      return due.length;
    };
    return {
      late: await stage({ status: 'in_progress', 'period.end': { $lte: new Date(now - graceMs) } }, 'overdueNotifiedAt', 'late'),
      escalated: await stage({ status: 'in_progress', 'period.end': { $lte: new Date(now - cfg.booking.overdueEscalationHours * HOUR_MS) } }, 'overdueEscalatedAt', 'escalated'),
      notStarted: await stage({ status: 'paid', 'period.start': { $lte: new Date(now - graceMs) } }, 'notStartedNotifiedAt', 'never_started'),
    };
  }

  // ── internals ────────────────────────────────────────────────────────
  async getDoc(bookingId: string): Promise<BookingDoc> {
    const b = await BookingModel.findOne({ _id: bookingId, deletedAt: null }).lean<BookingDoc>();
    if (!b) throw new NotFoundError('Booking');
    return b;
  }

  /**
   * Public receipt verification, for the QR code on a receipt.
   *
   * Keyed by the booking's UUID (unguessable — no enumeration), and returns
   * only what confirms a receipt is genuine: the code, its status, the dates
   * and the total. No names, no vehicle, no PII — anyone can scan the QR and
   * confirm the receipt without exposing the people on it.
   */
  async publicVerify(bookingId: string): Promise<{
    valid: boolean;
    code?: string;
    status?: string;
    period?: { start: Date; end: Date };
    total?: number;
    currency?: string;
    issuedAt?: Date;
    receipts?: { receiptNo: string; kind: string; total: number; issuedAt: Date }[];
  }> {
    const b = await BookingModel.findOne({ _id: bookingId, deletedAt: null }).lean<BookingDoc>();
    if (!b) return { valid: false };
    const { receipts } = await this.buildReceipts(b, false);
    return {
      receipts: receipts.map((r) => ({ receiptNo: r.receiptNo, kind: r.kind, total: r.total.amount, issuedAt: r.issuedAt })),
      valid: true,
      code: b.code,
      status: b.status,
      period: b.period,
      total: b.priceBreakdown.total.amount,
      currency: b.priceBreakdown.currency,
      issuedAt: b.createdAt,
    };
  }

  /**
   * Add an approved driver to the trip. Only the guest can, and only before the
   * trip ends — a driver added after the fact wouldn't have been covered.
   * Capped so the field can't be used to store arbitrary data.
   */
  async addDriver(
    userId: string,
    bookingId: string,
    driver: { name: string; licenseNumber?: string },
  ): Promise<BookingDoc> {
    const booking = await this.getDoc(bookingId);
    if (booking.guestId !== userId) throw new ForbiddenError('Only the guest can add drivers');
    if (['completed', 'cancelled'].includes(booking.status)) {
      throw new ConflictError('Cannot add drivers to a finished trip', 'INVALID_STATE');
    }
    if ((booking.additionalDrivers?.length ?? 0) >= 5) {
      throw new ConflictError('Maximum of 5 additional drivers', 'TOO_MANY_DRIVERS');
    }
    await BookingModel.updateOne(
      { _id: bookingId },
      { $push: { additionalDrivers: { ...driver, addedAt: new Date() } } },
    );
    return this.getDoc(bookingId);
  }

  async removeDriver(userId: string, bookingId: string, name: string): Promise<BookingDoc> {
    const booking = await this.getDoc(bookingId);
    if (booking.guestId !== userId) throw new ForbiddenError('Only the guest can remove drivers');
    await BookingModel.updateOne({ _id: bookingId }, { $pull: { additionalDrivers: { name } } });
    return this.getDoc(bookingId);
  }

  private async transition(
    booking: BookingDoc,
    to: BookingStatus,
    by: string,
    reason?: string,
  ): Promise<void> {
    if (!canTransition(booking.status, to)) {
      throw new ConflictError(
        `Illegal transition ${booking.status} → ${to}`,
        'ILLEGAL_TRANSITION',
      );
    }
    // Optimistic concurrency: only transition if version unchanged.
    const res = await BookingModel.updateOne(
      { _id: booking._id, version: booking.version },
      {
        $set: { status: to },
        $inc: { version: 1 },
        $push: { statusHistory: { from: booking.status, to, at: new Date(), by, reason } },
      },
    );
    if (res.matchedCount === 0) {
      throw new ConflictError('Booking was modified concurrently, retry', 'VERSION_CONFLICT');
    }
  }

  private parsePeriod(startIn: unknown, endIn: unknown): { start: Date; end: Date } {
    const start = new Date(startIn as string);
    const end = new Date(endIn as string);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new ValidationError('Invalid dates');
    }
    if (start >= end) throw new ValidationError('start must be before end');
    if (start.getTime() < Date.now() - 60_000) throw new ValidationError('start must be in the future');
    return { start, end };
  }

  private assertDuration(start: Date, end: Date, minH: number, maxH: number): void {
    const hours = (end.getTime() - start.getTime()) / 3_600_000;
    if (hours < minH) throw new ValidationError(`Minimum trip length is ${minH} hours`);
    if (hours > maxH) throw new ValidationError(`Maximum trip length is ${maxH} hours`);
  }

  private async assertBookableWindow(vehicleId: string, start: Date, end: Date): Promise<void> {
    const v = await vehicleService.getForBooking(vehicleId);
    if (!v.bookable) throw new ConflictError('Vehicle is not bookable', 'NOT_BOOKABLE');
    this.assertDuration(start, end, v.minTripHours, v.maxTripHours);
  }

  private async assertHostOwner(userId: string, hostId: string): Promise<void> {
    if (!(await this.isHostOwner(userId, hostId))) {
      throw new ForbiddenError('You are not the host for this booking');
    }
  }

  /** Public: other modules gate participant-only reads on this. */
  async isHostOwner(userId: string, hostId: string): Promise<boolean> {
    const host = await hostService.getByUserId(userId);
    return !!host && host._id === hostId;
  }

  private async hostUserId(hostId: string): Promise<string | null> {
    try {
      const host = await hostService.getById(hostId);
      return host.userId;
    } catch {
      return null;
    }
  }

  private generateCode(): string {
    return `TURA-${randomId().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
  }
}

export const bookingService = new BookingService();
