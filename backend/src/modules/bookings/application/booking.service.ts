import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { config } from '../../../config';
import { BookingModel, type BookingDoc, type BookingExtension, type BookingChange } from '../infrastructure/booking.model';
import { PaymentModel, type PaymentDoc } from '../../payments/infrastructure/payment.model';
import type { AvailabilityDoc } from '../../availability/infrastructure/availability.model';
import { canTransition, type BookingStatus } from '../domain/booking-status';
import { lateFeeCents, dayPriceCents } from '../domain/late-fee';
import { computeRefund, explainRefund, serviceFeeOf, type RefundExplanation } from '../domain/cancellation-policy';
import { undoWindowEndsAt, inUndoWindow, creditBonus, pickupShiftChoices, scaleSplit, type CancelReasonCode } from '../domain/trip-change-rules';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { wheelbaseInsuranceService } from '../../insurance/application/wheelbase-insurance.service';
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
import { PrePhotoModel } from '../../trips/infrastructure/trip.model';
import { couponService } from '../../coupons/application/coupon.service';
import { hostService } from '../../hosts/application/host.service';
import { ledgerService } from '../../payments/application/ledger.service';
import { Account, type LedgerLeg } from '../../payments/domain/ledger.accounts';
import { notificationService } from '../../notifications/application/notification.service';
import { logger } from '../../../infrastructure/logging/logger';
import { kv } from '../../../infrastructure/cache/kv-store';
import { userService } from '../../users/application/user.service';
import { NotFoundError, ConflictError, ForbiddenError, ValidationError } from '../../../core/errors/app-error';
import { uuid, randomId } from '../../../shared/utils/uuid';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { decodeCursor, cursorFilter, toPage } from '../../../shared/utils/pagination';
import type { Page, Principal } from '../../../core/types/common';
import type { Money } from '../../../core/types/money';
import type { PriceBreakdown } from '../../../core/contracts/pricing.contract';
import type { CreateBookingDto } from '../dto/booking.schemas';

const PICKUP_HASH_V2 = 'v2:';

/** Keyed digest of a pickup code, bound to its booking, so a leaked hash cannot be brute-forced offline. */
function pickupDigest(bookingId: string, code: string): Buffer {
  return createHmac('sha256', config.jwt.accessSecret).update(`${bookingId}:${code}`).digest();
}

/** A booking as clients may see it: never the pickup-code hash, and for non-admins no internal ids, idempotency key or terms IP. */
export function toPublicBooking<T extends object>(booking: T, isAdmin = false): T {
  const out = { ...booking } as Record<string, unknown>;
  delete out.pickupCodeHash;
  delete out.pickupCodeAttempts;
  if (!isAdmin) {
    delete out.idempotencyKey;
    delete out.holdId;
    delete out.paymentId;
    if (out.terms && typeof out.terms === 'object') {
      const terms = { ...(out.terms as Record<string, unknown>) };
      delete terms.ip;
      out.terms = terms;
    }
  }
  return out as T;
}

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

/** Why a booking is being moved to another car, and the booking that caused it. */
interface SwapContext {
  reason: 'extension' | 'late_return' | 'guest_switch';
  causeBookingId: string;
  extensionEarnings?: Money;
}

const SWAP_NOTE: Record<SwapContext['reason'], string> = {
  extension: 'Moved to a similar car so another guest could extend their trip',
  late_return: 'Guest chose a similar car because the booked car was late back',
  guest_switch: 'Guest switched to a similar car at the same price',
};

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

  /** One booking request at a time per guest, so a double tap or replay cannot spend the wallet twice or slip past the open-request cap. */
  async create(...args: Parameters<BookingService['createUnlocked']>): ReturnType<BookingService['createUnlocked']> {
    const lockKey = `lock:booking-create:${args[0]}`;
    // Redis down mid-request must not stop bookings: go ahead unlocked, the unique idempotency key and the atomic wallet spend still guard the money.
    const held = await kv().acquire(lockKey, 60).catch((err: Error) => {
      logger.warn({ err: err.message }, 'booking lock unavailable — continuing without it');
      return null;
    });
    if (held === false) {
      throw new ConflictError('Your last booking request is still being processed. Please wait a moment.', 'BOOKING_IN_PROGRESS');
    }
    try {
      return await this.createUnlocked(...args);
    } finally {
      if (held) await kv().del(lockKey).catch(() => undefined);
    }
  }

  private async createUnlocked(
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
    // Namespaced by guest so one user's key can never match, or read, another user's booking.
    const scopedKey = idempotencyKey ? `${guestId}:${idempotencyKey}` : undefined;
    if (scopedKey) {
      const existing = await BookingModel.findOne({ guestId, idempotencyKey: scopedKey }).lean<BookingDoc>();
      if (existing) return toPublicBooking(existing);
    }

    // Cap open requests per guest so one account cannot sit on many dates at once.
    const openPending = await BookingModel.countDocuments({
      guestId,
      status: { $in: ['pending_approval', 'pending_verification', 'pending_payment'] },
      deletedAt: null,
    });
    if (openPending >= (await platformConfigService.get()).booking.maxOpenPendingPerGuest) {
      throw new ConflictError(
        'You have too many booking requests waiting. Wait for a host to respond or cancel one before requesting another.',
        'TOO_MANY_OPEN_REQUESTS',
      );
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
    // Renter details are asked for when someone books, not as a gate after sign-up; the server holds the line so no client can skip it.
    const profile = await userService.profileStatus(guestId);
    if (!profile.complete) {
      throw new ConflictError('Add a few details before your first trip.', 'PROFILE_INCOMPLETE');
    }

    const eligibility = await eligibilityService.evaluate(guestId, end);
    if (!eligibility.canRequest) {
      throw new ForbiddenError('This account cannot book. Contact support.');
    }
    // Inside the verification cutoff a held booking would lapse (with a fee) minutes after it was made, so verify first.
    const { verificationCutoffHours } = (await platformConfigService.get()).booking;
    if (!eligibility.eligible && start.getTime() - verificationCutoffHours * HOUR_MS <= Date.now()) {
      throw new ConflictError('This trip starts soon, so please verify your ID before booking. It takes about two minutes, and we’ll bring you right back.', 'IDENTITY_REQUIRED');
    }
    // The car's insurance must cover this trip: approved in Wheelbase (when required) and the driver old enough.
    await wheelbaseInsuranceService.assertInsurable(dto.vehicleId, guestId, start);

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

    // Reserve the slot BEFORE talking to the gateway (prevents double-booking
    // during the payment round-trip). Roll back on any downstream failure.
    const holdId = await availabilityService.placeHold(dto.vehicleId, start, end);
    // Held outside the try so the failure path can reverse a charge that
    // succeeded before a later step threw.
    let charged: { paymentId: string; intentId: string; status: string } | null = null;
    const bookingId = uuid();
    let walletApplied = 0;

    try {
      // Pay-with-wallet on instant bookings: spend FIRST, atomically, so the card only ever covers the remainder and a lost race can never refund money that was not spent.
      if (dto.useWallet && effectiveInstant && eligibility.eligible) {
        walletApplied = await walletService.spendUpTo(guestId, breakdown.total.amount, 'booking', bookingId, `wallet_spend_${bookingId}`);
      }

      // Paying on the page with another method (wallets, pay later, Cash App…) is for trips that confirm on payment: an Instant Book trip for a verified guest.
      const payOnPage = dto.payWith === 'other';
      if (payOnPage && !((await platformConfigService.get()).checkout.otherMethodsEnabled && effectiveInstant && eligibility.eligible)) {
        throw new ConflictError('Other payment options are available on Instant Book trips once you are verified. Please pay with a card for this one.', 'PAY_WITH_CARD');
      }

      // Without a card nothing is authorised, so "your card is held" would be untrue and a later capture would fail.
      if (!payOnPage && breakdown.total.amount - walletApplied > 0 && !(await paymentMethodService.hasChargeableCard(guestId))) {
        throw new ConflictError('Add a payment card to book this trip. It isn’t charged until the trip is confirmed.', 'PAYMENT_METHOD_REQUIRED');
      }

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
        idempotencyKey: scopedKey ?? bookingId,
        anyMethod: payOnPage,
      });

      charged = { paymentId: charge.paymentId, intentId: charge.intentId, status: charge.status };

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
        insurance: await wheelbaseInsuranceService.snapshot(dto.vehicleId),
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
        idempotencyKey: scopedKey,
      });

      if (status === 'paid') {
        await availabilityService.confirmHold(holdId, bookingId, (await availabilityService.tripDayKeys(dto.vehicleId, start, end)).length);
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
        ...toPublicBooking(booking.toObject()),
        ...(charge.requiresAction
          ? { requiresAction: true, clientSecret: charge.clientSecret }
          : {}),
        // The guest now pays on the page; the booking confirms when Stripe reports the money (webhook, return page or the reconcile job).
        ...(payOnPage && status === 'pending_payment' ? { requiresPayment: true, clientSecret: charge.clientSecret } : {}),
      };
    } catch (err) {
      await availabilityService.releaseHold(holdId);
      await couponService.release(bookingId).catch(() => undefined);

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
      } else if (walletApplied > 0) {
        // The wallet was spent but no charge exists: give back exactly what was taken.
        await paymentService
          .restoreWallet(bookingId, guestId, walletApplied, breakdown.total.currency)
          .catch((restoreErr) =>
            logger.error({ bookingId, guestId, walletApplied, err: (restoreErr as Error).message }, 'CRITICAL: wallet spent, booking failed, restore failed — manual credit required'),
          );
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
          booking.holdId = await this.ensureHold(booking);
        } catch {
          await this.systemCancel(booking._id, 'The dates were taken while we verified your licence');
          continue;
        }
        try {
          await paymentService.captureBooking(booking._id);
        } catch (err) {
          // The hold lapsed or the card refused: hand it to the same path as any failed payment so both sides are told.
          emit(EVENTS.PAYMENT_FAILED, booking._id, { bookingId: booking._id, reason: (err as Error).message });
          continue;
        }
        try {
          await availabilityService.confirmHold(booking.holdId!, booking._id, (await availabilityService.tripDayKeys(booking.vehicleId, booking.period.start, booking.period.end)).length);
        } catch {
          await this.cancelCapturedBooking(doc, 'The dates were no longer held when verification completed');
          continue;
        }
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

    // Claim first so a concurrent cancel cannot also refund.
    await this.transition(booking, 'cancelled_system', 'system', reason);
    try {
      if (booking.status === 'paid' || booking.status === 'confirmed') {
        refund = { ...total };
        await paymentService.refundBooking(bookingId, refund, reason);
      } else {
        await paymentService.cancelAuthorization(bookingId);
      }
    } catch (err) {
      await this.revertTransition(booking, 'cancelled_system');
      throw err;
    }

    await availabilityService.releaseBooking(bookingId);
    if (booking.holdId) await availabilityService.releaseHold(booking.holdId);
    await BookingModel.updateOne(
      { _id: bookingId },
      { cancellation: { by: 'system', role: 'system', at: new Date(), reason, refund } },
    );
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

  /** A required screening check failed: every upcoming trip this guest holds is ended with a full refund. Returns those trips. */
  async cancelForFailedCheck(guestId: string, checkLabel: string): Promise<{ bookingId: string; start: Date }[]> {
    const upcoming = await BookingModel.find({
      guestId,
      deletedAt: null,
      tripId: { $exists: false },
      status: { $in: ['pending_verification', 'pending_approval', 'pending_payment', 'confirmed', 'paid'] },
      'period.end': { $gt: new Date() },
    })
      .select('_id period')
      .lean<Pick<BookingDoc, '_id' | 'period'>[]>();
    const cancelled: { bookingId: string; start: Date }[] = [];
    for (const b of upcoming) {
      try {
        await this.systemCancel(b._id, `Your ${checkLabel} check was not successful, so this trip was cancelled with a full refund.`);
        cancelled.push({ bookingId: b._id, start: b.period.start });
      } catch (err) {
        logger.error({ err, bookingId: b._id, guestId }, 'could not cancel trip after a failed check');
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
    if (booking.approvalDeadline && new Date(booking.approvalDeadline).getTime() <= Date.now()) {
      throw new ConflictError('The response window for this request has passed', 'APPROVAL_EXPIRED');
    }
    // Dates must still be held before any money is captured.
    const holdId = await this.ensureHold(booking);
    await paymentService.captureBooking(bookingId);
    try {
      await availabilityService.confirmHold(holdId, bookingId, (await availabilityService.tripDayKeys(booking.vehicleId, booking.period.start, booking.period.end)).length);
    } catch (err) {
      await this.cancelCapturedBooking(booking, 'The dates were no longer held when the host approved');
      throw err;
    }
    await this.transition(booking, 'paid', userId, 'Host approved');
    emit(EVENTS.BOOKING_CONFIRMED, bookingId, { bookingId, guestId: booking.guestId, hostId: booking.hostId });
    return toPublicBooking(await this.getDoc(bookingId));
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
    return toPublicBooking(await this.getDoc(bookingId));
  }

  /** When this guest's free undo window closes for a booking, or null when there is none. */
  async undoWindowFor(booking: Pick<BookingDoc, 'guestId' | 'createdAt' | 'period'>): Promise<Date | null> {
    const rules = (await platformConfigService.get()).tripChanges;
    if (rules.undoWindowMinutes <= 0) return null;
    const used = await BookingModel.countDocuments({
      guestId: booking.guestId,
      'cancellation.undo': true,
      'cancellation.at': { $gte: new Date(Date.now() - 30 * 24 * HOUR_MS) },
    });
    return undoWindowEndsAt({ createdAt: new Date(booking.createdAt), start: booking.period.start }, rules, used);
  }

  /** What a guest cancelling right now gets back: the undo window refunds in full, otherwise the policy decides. */
  private async guestRefundNow(booking: BookingDoc): Promise<{ refund: Money; explained?: RefundExplanation; undo: boolean }> {
    const total = booking.priceBreakdown.total;
    if (inUndoWindow(await this.undoWindowFor(booking))) return { refund: { ...total }, undo: true };
    const cancelCfg = (await platformConfigService.get()).cancellation;
    const explained = explainRefund(booking.cancellationPolicy, total, booking.period.start, cancelCfg, new Date(), serviceFeeOf(booking.priceBreakdown));
    return { refund: explained.refund, explained, undo: false };
  }

  /** Guest or host cancels; refund computed by policy. */
  async cancel(
    principal: Principal,
    bookingId: string,
    reason: string,
    opts: { reasonCode?: CancelReasonCode; choice?: 'refund' | 'credit' } = {},
  ): Promise<BookingDoc> {
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
    let explained: RefundExplanation | undefined;
    let undo = false;
    let creditBonusCents = 0;
    let sent = { toCard: 0, toWallet: 0 };
    const changeRules = (await platformConfigService.get()).tripChanges;
    const asCredit = isGuest && opts.choice === 'credit' && changeRules.creditEnabled;
    // Only money actually taken can be kept; a held-but-uncaptured card is released in full.
    const captured = booking.status === 'paid' || booking.status === 'confirmed';

    // Claim the cancellation first (version-checked): a parallel cancel loses here, before any money moves.
    await this.transition(booking, actor, principal.userId, reason);
    try {
      if (booking.status === 'paid' || booking.status === 'confirmed') {
        // Host and admin cancellations refund in full — the guest did nothing
        // wrong and is being stranded. Only a guest cancellation is policy-bound.
        if (isGuest) {
          ({ refund, explained, undo } = await this.guestRefundNow(booking));
        } else {
          refund = { ...total };
        }
        if (refund.amount > 0) {
          sent = (await paymentService.refundBooking(bookingId, refund, reason, { toWallet: asCredit })) ?? sent;
        }
      } else {
        await paymentService.cancelAuthorization(bookingId);
      }
    } catch (err) {
      await this.revertTransition(booking, actor);
      throw err;
    }

    // The bonus is a promise made on the cancel screen; the refund already landed, so a failure here goes to staff, not the guest.
    if (asCredit && sent.toWallet > 0) {
      creditBonusCents = creditBonus(sent.toWallet, changeRules.creditBonusBps);
      await walletService
        .grantCredit(booking.guestId, creditBonusCents, {
          txnId: `credit_bonus_${bookingId}`,
          refType: 'cancel_credit_bonus',
          refId: bookingId,
          description: `Bonus for keeping the refund of ${booking.code} as CatoDrive credit`,
        })
        .catch((err) => {
          creditBonusCents = 0;
          logger.error({ err, bookingId }, 'cancel credit bonus failed');
        });
    }

    await availabilityService.releaseBooking(bookingId);
    if (booking.holdId) await availabilityService.releaseHold(booking.holdId);
    await depositService.release(bookingId, 'Trip cancelled').catch(() => undefined);

    await BookingModel.updateOne(
      { _id: bookingId },
      {
        cancellation: {
          by: principal.userId,
          role: isHost ? 'host' : isGuest ? 'guest' : 'admin',
          at: new Date(),
          reason,
          refund,
          charged: { amount: captured ? Math.max(0, total.amount - refund.amount) : 0, currency: total.currency },
          ...(opts.reasonCode ? { reasonCode: opts.reasonCode } : {}),
          ...(isGuest && captured && refund.amount > 0 ? { choice: asCredit ? 'credit' : 'refund' } : {}),
          ...(creditBonusCents > 0 ? { creditBonus: { amount: creditBonusCents, currency: total.currency } } : {}),
          ...(undo ? { undo: true } : {}),
        },
      },
    );
    emit(EVENTS.BOOKING_CANCELLED, bookingId, {
      bookingId,
      guestId: booking.guestId,
      hostId: booking.hostId,
      cancelledBy: isHost ? 'host' : isGuest ? 'guest' : 'system',
      refund,
      charged: { amount: captured ? Math.max(0, total.amount - refund.amount) : 0, currency: total.currency },
      ...(captured ? { explained, toCard: sent.toCard, toWallet: sent.toWallet, creditBonus: creditBonusCents, undo } : {}),
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
    return toPublicBooking(await this.getDoc(bookingId));
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
    // A host who inspected the car or verified the guest's code was at the handover, so the guest was not a no-show.
    if (party === 'guest' && !isAdmin) {
      const hostWasThere =
        !!booking.pickupVerifiedAt ||
        !!(await PrePhotoModel.exists({ bookingId, byUserId: { $ne: booking.guestId } }));
      if (hostWasThere) {
        throw new ConflictError('The handover was already under way, so this can’t be reported as a no-show. Contact support if there is a problem.', 'HANDOVER_STARTED');
      }
    }

    const total = booking.priceBreakdown.total;

    if (party === 'host') {
      // Claim first so a concurrent no-show report cannot also refund.
      await this.transition(booking, 'cancelled_host', principal.userId, 'Host no-show');
      try {
        await paymentService.refundBooking(bookingId, total, 'Host no-show — full refund');
      } catch (err) {
        await this.revertTransition(booking, 'cancelled_host');
        throw err;
      }
      await availabilityService.releaseBooking(bookingId);
      if (booking.holdId) await availabilityService.releaseHold(booking.holdId);
      await BookingModel.updateOne(
        { _id: bookingId },
        { cancellation: { by: principal.userId, role: isGuest ? 'guest' : 'admin', at: new Date(), reason: 'Host no-show', refund: total } },
      );
      emit(EVENTS.BOOKING_HOST_NO_SHOW, bookingId, { bookingId, guestId: booking.guestId, hostId: booking.hostId });
      emit(EVENTS.BOOKING_REBOOKING_NEEDED, bookingId, {
        bookingId, guestId: booking.guestId, vehicleId: booking.vehicleId,
        start: booking.period.start, end: booking.period.end, reason: 'host_no_show',
      });
      return toPublicBooking(await this.getDoc(bookingId));
    }

    // Guest no-show — forfeit a share, refund the rest, scale the host's earnings
    // to their part of the forfeit (paid via the payout subscriber).
    const forfeitBps = cfg.noShow.guestForfeitBps;
    const refundAmount = Math.round((total.amount * (10000 - forfeitBps)) / 10000);
    // Claim first so a concurrent no-show report cannot also refund.
    await this.transition(booking, 'cancelled_guest', principal.userId, 'Guest no-show — forfeit applied');
    if (refundAmount > 0) {
      try {
        await paymentService.refundBooking(bookingId, { amount: refundAmount, currency: total.currency }, 'Guest no-show — partial forfeit');
      } catch (err) {
        await this.revertTransition(booking, 'cancelled_guest');
        throw err;
      }
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
    emit(EVENTS.BOOKING_GUEST_NO_SHOW, bookingId, { bookingId, guestId: booking.guestId, hostId: booking.hostId });
    return toPublicBooking(await this.getDoc(bookingId));
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
    const hash = `${PICKUP_HASH_V2}${pickupDigest(bookingId, code).toString('hex')}`;
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
    // A code stored as a bare SHA-256 can be brute-forced offline (only a million possibilities): it is retired and the guest issues a fresh one.
    if (!booking.pickupCodeHash.startsWith(PICKUP_HASH_V2)) {
      throw new ConflictError('This pickup code is out of date. The guest must generate a new one.', 'PICKUP_CODE_INVALID');
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

    const given = pickupDigest(bookingId, code);
    const stored = Buffer.from(booking.pickupCodeHash.slice(PICKUP_HASH_V2.length), 'hex');
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

    return toPublicBooking(covered > 0 ? await this.getDoc(replacement._id) : replacement);
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
    // Claim atomically before paying: a replayed rebook finds it already applied.
    const claimed = await BookingModel.updateOne(
      { _id: replacement._id, 'coveredDifference.amount': { $in: [null, 0] } },
      { rebookedFrom: original._id, coveredDifference: { amount: covered, currency } },
    );
    if (claimed.modifiedCount === 0) return 0;

    try {
      await ledgerService.post({
        txnId: `rebook_guarantee_${original._id}`,
        refType: 'rebooking_protection',
        refId: replacement._id,
        currency,
        description: `Rebooking guarantee: covered the difference after a host cancellation (${original.code})`,
        legs: [
          { account: Account.guaranteeExpense(), direction: 'debit', amount: covered },
          { account: Account.userWallet(original.guestId), direction: 'credit', amount: covered },
        ],
      });
    } catch (err) {
      // Nothing was paid, so release the claim and let a retry apply it.
      await BookingModel.updateOne({ _id: replacement._id }, { $unset: { coveredDifference: '', rebookedFrom: '' } });
      throw err;
    }

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
        ? (await this.guestRefundNow(booking)).refund
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
    /** Extending after the grace period: the late time already passed, charged with the extension. */
    lateCharge?: Money;
    lateHours?: number;
    swap?: { possible: true; vehicle: { id: string; make: string; model: string; year: number } };
  }> {
    const booking = await this.getDoc(bookingId);
    if (booking.guestId !== userId) throw new ForbiddenError('Only the guest can extend');

    const plan = await this.planExtension(booking, newEndIso);
    if (!plan.ok) return { available: false, reason: plan.reason, newEnd: plan.newEnd?.toISOString() ?? newEndIso };

    const late = await this.lateSoFar(booking);
    const base = { extraCost: plan.extra.total, days: plan.days, newEnd: plan.newEnd.toISOString(), ...(late.amount ? { lateCharge: { amount: late.amount, currency: booking.priceBreakdown.currency }, lateHours: late.hours } : {}) };
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
    const late = await this.lateSoFar(booking);
    const swap = plan.swap;
    const extended = swap
      ? await this.moveVehicle(swap, { reason: 'extension', causeBookingId: bookingId, extensionEarnings: plan.extra.hostEarnings }, (chosen) =>
          this.commitExtension(booking, plan, userId, { movedBookingId: swap.blocker._id, toVehicleId: chosen.candidate._id }),
        )
      : await this.commitExtension(booking, plan, userId);
    if (late.hours > 0) {
      const { incidentalsService } = await import('./incidentals.service');
      await incidentalsService
        .chargeLateReturn(bookingId, late.hours, `Extended ${late.hours} started hour${late.hours === 1 ? '' : 's'} after the grace period ended; the late time before the extension is charged.`)
        .catch((err) => logger.error({ err, bookingId }, 'late fee before extension failed'));
    }
    return extended;
  }

  /** Started hours past the grace period right now, and what they cost; zero before the grace ends. */
  private async lateSoFar(booking: BookingDoc): Promise<{ hours: number; amount: number }> {
    const cfg = await platformConfigService.get();
    const lateMs = Date.now() - booking.period.end.getTime() - (cfg.tracking?.overdueGraceMinutes ?? 60) * 60_000;
    if (lateMs <= 0) return { hours: 0, amount: 0 };
    const hours = Math.min(Math.ceil(lateMs / HOUR_MS), cfg.incidentals.maxLateHours ?? 72);
    const amount = lateFeeCents(hours, {
      perHourCents: cfg.incidentals.lateReturnPerHourCents,
      hourlyMaxHours: cfg.incidentals.lateHourlyMaxHours ?? 6,
      halfDayMaxHours: cfg.incidentals.lateHalfDayMaxHours ?? 12,
      dayCents: dayPriceCents(booking.priceBreakdown),
    });
    return { hours, amount };
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
    if (booking.period.end.getTime() <= Date.now()) {
      // Past the return time the trip may still be extended for a while, if the car is out (not yet returned).
      const lateMs = Date.now() - booking.period.end.getTime();
      if (booking.status !== 'in_progress' || lateMs > (cfg.lateExtendHours ?? 0) * HOUR_MS) {
        return fail('TRIP_ENDED', 'Your return time has passed, so this trip can no longer be extended. Please return the car.');
      }
    }
    // The licence and account must still be good through the NEW end date.
    const eligibility = await eligibilityService.evaluate(booking.guestId, newEnd);
    if (!eligibility.eligible) {
      return fail('NOT_ELIGIBLE', 'Your verification does not cover the extended dates. Update your documents to extend.');
    }
    // Extra days are whole calendar days, the same keys the availability calendar uses.
    const tz = await availabilityService.timeZoneOf(booking.vehicleId);
    const extraStart = dayAfter(booking.period.end, tz);
    if (newEnd < extraStart) return fail('TOO_SHORT', 'Extend by at least one more calendar day.');
    const days = dayKeys(extraStart, newEnd, tz).length;
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
          // A new return time earns its own reminders, and the car is no longer overdue.
          $unset: { returnRemindersSent: 1, overdueNotifiedAt: 1, overdueEscalatedAt: 1, nextBookingAlertedAt: 1 },
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
            // Extra days under the same insurer add to what that insurer is owed for this trip.
            ...(extra.protectionInsurer && extra.protectionInsurer.id === booking.priceBreakdown.protectionInsurer?.id
              ? { 'priceBreakdown.protectionInsurer.share.amount': extra.protectionInsurer.share.amount }
              : {}),
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
      return toPublicBooking(await this.getDoc(bookingId));
    } catch (err) {
      await availabilityService.releaseHold(holdId);
      throw err;
    }
  }

  /** Split a quote into payment legs that sum to the total: protection and service fee ride in commission, rental tax in tax. */
  private paymentSplit(b: PriceBreakdown): { hostEarnings: Money; commission: Money; tax: Money; insurer?: { id: string; share: number } } {
    const currency = b.currency;
    return {
      hostEarnings: b.hostEarnings,
      commission: { amount: b.commission.amount + b.protection.amount + (b.serviceFee?.amount ?? 0), currency },
      tax: { amount: b.tax.amount + (b.taxTotal?.amount ?? 0), currency },
      ...(b.protectionInsurer ? { insurer: { id: b.protectionInsurer.id, share: b.protectionInsurer.share.amount } } : {}),
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
    if (!blocker || blocker.guestId === booking.guestId || blocker.vehicleId !== booking.vehicleId) return null;
    return this.swapPlanFor(blocker, cfg, true);
  }

  /** Comparable cars `blocker` could move to at the same price band, or null when it cannot be moved. */
  private async swapPlanFor(
    blocker: BookingDoc,
    cfg: { swapPolicy: 'auto' | 'off'; swapPriceToleranceBps: number; swapMaxAbsorbCents: number },
    mustBeUpcoming: boolean,
  ): Promise<SwapPlan | null> {
    if (cfg.swapPolicy !== 'auto') return null;
    if (
      blocker.status !== 'paid' ||
      blocker.tripId ||
      (mustBeUpcoming && blocker.period.start.getTime() <= Date.now()) ||
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
    ctx: SwapContext,
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
    if (!chosen) throw new ConflictError(ctx.reason === 'extension' ? 'Vehicle is not available for the extended dates' : 'No similar car is free for your dates any more.', 'NOT_AVAILABLE');

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
          extenderBookingId: ctx.causeBookingId,
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
    ctx: SwapContext,
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
            ...(blocker.swapOffer?.status === 'open' ? { 'swapOffer.status': 'expired', 'swapOffer.respondedAt': at } : {}),
            'priceBreakdown.hostEarnings.amount': quote.hostEarnings.amount,
            'priceBreakdown.commission.amount': quote.commission.amount,
            'priceBreakdown.tax.amount': quote.tax.amount,
            swap: {
              fromVehicleId: blocker.vehicleId,
              fromHostId: blocker.hostId,
              toVehicleId: candidate._id,
              toHostId: candidate.hostId,
              reason: ctx.reason,
              at,
              ...(ctx.reason === 'extension' ? { extendedByBookingId: ctx.causeBookingId } : { lateBookingId: ctx.causeBookingId }),
            },
          },
          $inc: { version: 1 },
          $push: {
            statusHistory: {
              from: blocker.status,
              to: blocker.status,
              at,
              by: 'system',
              reason: SWAP_NOTE[ctx.reason],
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
        description: `Booking ${blocker.code}: ${SWAP_NOTE[ctx.reason].toLowerCase()}`,
        legs: legs.filter((l) => l.amount > 0),
      });

      emit(EVENTS.BOOKING_SWAPPED, blocker._id, {
        bookingId: blocker._id,
        guestId: blocker.guestId,
        fromVehicleId: blocker.vehicleId,
        fromHostId: blocker.hostId,
        toVehicleId: candidate._id,
        toHostId: candidate.hostId,
        reason: ctx.reason,
        extendedByBookingId: ctx.reason === 'extension' ? ctx.causeBookingId : undefined,
        extensionEarnings: ctx.extensionEarnings,
        paid,
        absorbed: chosen.absorb,
      });
    } catch (err) {
      logger.error({ err, bookingId: blocker._id }, 'booking swap could not be finalised');
      emit(EVENTS.BOOKING_SWAP_FAILED, blocker._id, {
        bookingId: blocker._id,
        extenderBookingId: ctx.causeBookingId,
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
          pb.protectionLabel ?? pb.protectionPlan,
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
          lines: lines(`Extension · ${e.days} day${e.days === 1 ? '' : 's'}`, e.parts, e.total.amount, pb.protectionLabel ?? pb.protectionPlan),
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
    return { available: true, refund: await this.shortenRefund(booking, removed, removedStart), newEnd: newEnd.toISOString() };
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
    const refund = await this.shortenRefund(booking, removed, removedStart);

    // Claim the change (version-checked) before money moves, so a parallel shorten cannot refund the same tail twice.
    const claim = await BookingModel.updateOne(
      { _id: bookingId, status: 'paid', version: booking.version },
      { $set: { 'period.end': newEnd }, $inc: { version: 1 } },
    );
    if (claim.matchedCount === 0) throw new ConflictError('Booking was modified concurrently, retry', 'VERSION_CONFLICT');
    if (refund.amount > 0) {
      try {
        await paymentService.refundBooking(bookingId, refund, `Trip shortened to ${newEnd.toISOString()}`);
      } catch (err) {
        await BookingModel.updateOne({ _id: bookingId, version: booking.version + 1 }, { $set: { 'period.end': booking.period.end }, $inc: { version: 1 } });
        throw err;
      }
    }
    await availabilityService.releaseRange(bookingId, removedStart, booking.period.end);

    // Roll the reduction into the booking totals: the host keeps their share of whatever was not refunded.
    const pb = booking.priceBreakdown;
    const kept = removed.total.amount > 0 ? refund.amount / removed.total.amount : 0;
    const cut = (part: number) => Math.round(part * kept);
    await BookingModel.updateOne(
      { _id: bookingId },
      {
        $set: {
          'priceBreakdown.total.amount': Math.max(0, pb.total.amount - refund.amount),
          'priceBreakdown.hostEarnings.amount': Math.max(0, pb.hostEarnings.amount - cut(removed.hostEarnings.amount)),
          'priceBreakdown.commission.amount': Math.max(0, pb.commission.amount - cut(removed.commission.amount)),
          'priceBreakdown.tax.amount': Math.max(0, pb.tax.amount - cut(removed.tax.amount)),
          'priceBreakdown.days': Math.max(1, pb.days - removed.days),
        },
        $push: {
          statusHistory: { from: booking.status, to: booking.status, at: new Date(), by: userId, reason: `Shortened to ${newEnd.toISOString()}` },
        },
      },
    );
    emit(EVENTS.BOOKING_SHORTENED, bookingId, { bookingId, guestId: booking.guestId, hostId: booking.hostId, newEnd });
    return toPublicBooking(await this.getDoc(bookingId));
  }

  /** What a shortened trip refunds: the tail priced on its own, cut by the cancellation policy, and never more than that tail's share of what was really paid (coupons and plans included). */
  private async shortenRefund(booking: BookingDoc, removed: PriceBreakdown, removedStart: Date): Promise<Money> {
    const pb = booking.priceBreakdown;
    const share = pb.days > 0 ? Math.floor((pb.total.amount * Math.min(removed.days, pb.days)) / pb.days) : 0;
    const rules = (await platformConfigService.get()).cancellation;
    const byPolicy = computeRefund(booking.cancellationPolicy, removed.total, removedStart, rules);
    return { amount: Math.min(byPolicy.amount, share), currency: removed.total.currency };
  }

  async get(principal: Principal, bookingId: string): Promise<BookingDoc> {
    const booking = await this.getDoc(bookingId);
    const isParticipant =
      booking.guestId === principal.userId || (await this.isHostOwner(principal.userId, booking.hostId));
    const isAdmin = principal.permissions.includes('booking:read:any') || principal.permissions.includes('*');
    if (!isParticipant && !isAdmin) throw new ForbiddenError('Not your booking');
    return toPublicBooking(booking, isAdmin);
  }

  async listForGuest(guestId: string, cursorRaw?: string, limit = 20): Promise<Page<BookingDoc>> {
    const cursor = decodeCursor(cursorRaw);
    const rows = await BookingModel.find({ guestId, deletedAt: null, ...cursorFilter(cursor) })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean<BookingDoc[]>();
    return toPage(rows.map((r) => toPublicBooking(r)), limit);
  }

  async listForHost(userId: string, cursorRaw?: string, limit = 20): Promise<Page<BookingDoc>> {
    const host = await hostService.requireHostForUser(userId);
    const cursor = decodeCursor(cursorRaw);
    const rows = await BookingModel.find({ hostId: host._id, deletedAt: null, ...cursorFilter(cursor) })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean<BookingDoc[]>();
    return toPage(rows.map((r) => toPublicBooking(r)), limit);
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
      let lapseFee = 0;
      try {
        // A guest who left identity verification unfinished keeps the host's dates blocked for nothing: the configured fee is taken from the hold.
        if (b.status === 'pending_verification' && bookingCfg.verificationLapseFeeCents > 0) {
          lapseFee = await paymentService.captureLapseFee(b._id, bookingCfg.verificationLapseFeeCents);
        } else {
          await paymentService.cancelAuthorization(b._id);
        }
        if (b.holdId) await availabilityService.releaseHold(b.holdId);
        const doc = await this.getDoc(b._id);
        await this.transition(doc, 'expired', 'system', lapseFee > 0 ? 'Verification not completed — lapse fee taken' : 'Approval window elapsed');
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
        feeCents: lapseFee,
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
  async failForPayment(bookingId: string, reason?: string, opts: { retryable?: boolean } = {}): Promise<boolean> {
    const booking = await this.getDoc(bookingId);
    const UNPAID: BookingStatus[] = ['pending_payment', 'pending_verification', 'pending_approval', 'confirmed'];
    if (!UNPAID.includes(booking.status)) return false;
    // A decline while the guest is still paying can be retried with another card; the payment window releases it if not.
    if (opts.retryable && booking.status === 'pending_payment') return false;

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
    return { items: items.map((i) => toPublicBooking(i, true)), total };
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
    // Claim first so a concurrent cancel cannot also refund.
    await this.transition(booking, 'cancelled_system', actorId, `[admin] ${reason}`);
    try {
      if (booking.status === 'paid' || booking.status === 'confirmed') {
        refund = { ...total }; // admin cancellation = full refund
        if (refund.amount > 0) await paymentService.refundBooking(bookingId, refund, reason);
      } else {
        await paymentService.cancelAuthorization(bookingId);
      }
    } catch (err) {
      await this.revertTransition(booking, 'cancelled_system');
      throw err;
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
    emit(EVENTS.BOOKING_CANCELLED, bookingId, {
      bookingId,
      guestId: booking.guestId,
      hostId: booking.hostId,
      refund,
    });
    return toPublicBooking(await this.getDoc(bookingId), true);
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
  async sweepLifecycle(): Promise<{ escalated: number; notStarted: number }> {
    const now = Date.now();
    const cfg = await platformConfigService.get();
    const graceMs = (cfg.tracking?.overdueGraceMinutes ?? 60) * 60_000;
    return {
      escalated: await this.overdueStage({ status: 'in_progress', 'period.end': { $lte: new Date(now - cfg.booking.overdueEscalationHours * HOUR_MS) } }, 'overdueEscalatedAt', 'escalated'),
      notStarted: await this.overdueStage({ status: 'paid', 'period.start': { $lte: new Date(now - graceMs) } }, 'notStartedNotifiedAt', 'never_started'),
    };
  }

  /** The moment the grace period ends: tell the guest and host the car is overdue. Run every minute so a short grace is honoured. */
  async sweepOverdueLate(): Promise<number> {
    const graceMs = ((await platformConfigService.get()).tracking?.overdueGraceMinutes ?? 60) * 60_000;
    return this.overdueStage({ status: 'in_progress', 'period.end': { $lte: new Date(Date.now() - graceMs) } }, 'overdueNotifiedAt', 'late');
  }

  private async overdueStage(
    filter: Record<string, unknown>,
    marker: 'overdueNotifiedAt' | 'overdueEscalatedAt' | 'notStartedNotifiedAt',
    kind: 'late' | 'escalated' | 'never_started',
  ): Promise<number> {
    const due = await BookingModel.find({ ...filter, [marker]: { $exists: false } }).lean<BookingDoc[]>();
    let sent = 0;
    for (const b of due) {
      // Claimed first: a crash after this can only skip a nudge, never repeat one, and two runs never both send it.
      const claimed = await BookingModel.updateOne({ _id: b._id, [marker]: { $exists: false } }, { [marker]: new Date() });
      if (!claimed.modifiedCount) continue;
      emit(EVENTS.BOOKING_OVERDUE, b._id, { bookingId: b._id, guestId: b.guestId, hostId: b.hostId, stage: kind });
      sent++;
    }
    return sent;
  }

  /**
   * The car is late back and `nextId` picks it up soon: offer that guest a similar car at no extra cost.
   * Returns the offered car's name, or null when no comparable car is free (or the booking cannot be moved).
   */
  async offerLateSwap(nextId: string, lateBookingId: string): Promise<string | null> {
    const next = await BookingModel.findOne({ _id: nextId, deletedAt: null }).lean<BookingDoc>();
    if (!next || next.swapOffer?.status === 'open') return next?.swapOffer?.toName ?? null;
    const plan = await this.swapPlanFor(next, (await platformConfigService.get()).extension, false);
    if (!plan) return null;
    const car = plan.options[0].candidate;
    const toName = [car.year, car.make, car.model].filter(Boolean).join(' ');
    await BookingModel.updateOne(
      { _id: nextId },
      { $set: { swapOffer: { status: 'open', toVehicleId: car._id, toName, lateBookingId, offeredAt: new Date() } } },
    );
    return toName;
  }

  /** The guest takes the similar car: the booking moves, same dates, same price. */
  async acceptSwapOffer(userId: string, bookingId: string): Promise<BookingDoc> {
    const booking = await this.getDoc(bookingId);
    if (booking.guestId !== userId) throw new ForbiddenError('Not your booking');
    const offer = booking.swapOffer;
    if (offer?.status !== 'open') throw new ConflictError('This offer is no longer available.', 'OFFER_CLOSED');
    const plan = await this.swapPlanFor(booking, (await platformConfigService.get()).extension, false);
    if (!plan) {
      await BookingModel.updateOne({ _id: bookingId }, { $set: { 'swapOffer.status': 'expired', 'swapOffer.respondedAt': new Date() } });
      throw new ConflictError('No similar car is free for your dates any more. Your booking stays on the original car, and our team will help if it is not back in time.', 'OFFER_CLOSED');
    }
    // The car the guest was shown goes first; another comparable car only if it was taken meanwhile.
    plan.options.sort((a, b) => Number(b.candidate._id === offer.toVehicleId) - Number(a.candidate._id === offer.toVehicleId));
    await this.moveVehicle(plan, { reason: 'late_return', causeBookingId: offer.lateBookingId }, async () => undefined);
    await BookingModel.updateOne({ _id: bookingId }, { $set: { 'swapOffer.status': 'accepted', 'swapOffer.respondedAt': new Date() } });
    return this.getDoc(bookingId);
  }

  async declineSwapOffer(userId: string, bookingId: string): Promise<{ declined: true }> {
    const res = await BookingModel.updateOne(
      { _id: bookingId, guestId: userId, 'swapOffer.status': 'open' },
      { $set: { 'swapOffer.status': 'declined', 'swapOffer.respondedAt': new Date() } },
    );
    if (!res.modifiedCount) throw new ConflictError('This offer is no longer available.', 'OFFER_CLOSED');
    return { declined: true };
  }

  /** The late car is back: open offers it caused are withdrawn, and those guests are told their car is ready. */
  async closeLateSwapOffers(lateBookingId: string): Promise<void> {
    const open = await BookingModel.find({ 'swapOffer.lateBookingId': lateBookingId, 'swapOffer.status': 'open' }).select('_id guestId').lean<{ _id: string; guestId: string }[]>();
    for (const b of open) {
      const res = await BookingModel.updateOne({ _id: b._id, 'swapOffer.status': 'open' }, { $set: { 'swapOffer.status': 'expired', 'swapOffer.respondedAt': new Date() } });
      if (res.modifiedCount) emit(EVENTS.NEXT_BOOKING_CLEARED, b._id, { bookingId: b._id, guestId: b.guestId });
    }
  }

  // ── Guest changes before pickup: shift pickup, move dates, switch car ──

  /** One change at a time per booking, so a double tap cannot charge, refund or move twice. */
  private async withChangeLock<T>(bookingId: string, run: () => Promise<T>): Promise<T> {
    const key = `lock:booking-change:${bookingId}`;
    if (!(await kv().acquire(key, 60))) {
      throw new ConflictError('Another change to this trip is in progress. Try again in a moment.', 'CHANGE_IN_PROGRESS');
    }
    try {
      return await run();
    } finally {
      await kv().del(key);
    }
  }

  private changesOf(booking: BookingDoc, kinds: BookingChange['kind'][]): number {
    return (booking.changes ?? []).filter((c) => kinds.includes(c.kind)).length;
  }

  /** The later pickup times this guest may pick right now, or why there are none. */
  async pickupShiftOptions(userId: string, bookingId: string): Promise<{ available: boolean; reason?: string; choices: string[] }> {
    const booking = await this.getDoc(bookingId);
    if (booking.guestId !== userId) throw new ForbiddenError('Not your booking');
    const block = await this.pickupShiftBlock(booking);
    if (block) return { available: false, reason: block, choices: [] };
    const cfg = await platformConfigService.get();
    const vehicle = await vehicleService.getForBooking(booking.vehicleId);
    const choices = pickupShiftChoices(booking.period.start, booking.period.end, cfg.tripChanges.pickupShiftMaxHours, vehicle.minTripHours);
    if (choices.length === 0) return { available: false, reason: 'Your trip is too short to start any later.', choices: [] };
    return { available: true, choices: choices.map((d) => d.toISOString()) };
  }

  async pickupShiftBlock(booking: BookingDoc): Promise<string | null> {
    const cfg = await platformConfigService.get();
    const rules = cfg.tripChanges;
    if (rules.pickupShiftMaxHours <= 0 || rules.pickupShiftsPerTrip <= 0) return 'Changing the pickup time is not available right now.';
    if (!['paid', 'confirmed'].includes(booking.status) || booking.tripId) return 'Only a confirmed trip that has not started can change its pickup time.';
    if (booking.delivery) return 'This trip is delivered to you, so the pickup time is arranged with our team. Message support to change it.';
    if (this.changesOf(booking, ['pickup_shift']) >= rules.pickupShiftsPerTrip) return 'You have already changed the pickup time for this trip.';
    // Past the no-show grace the car may already have been released.
    if (Date.now() > booking.period.start.getTime() + cfg.noShow.graceHours * HOUR_MS) return 'The pickup time has passed.';
    return null;
  }

  /** Start the trip later the same way it was booked: same car, same return time, same price. */
  async shiftPickup(userId: string, bookingId: string, newStartIso: string): Promise<BookingDoc> {
    return this.withChangeLock(bookingId, async () => {
      const booking = await this.getDoc(bookingId);
      if (booking.guestId !== userId) throw new ForbiddenError('Not your booking');
      const block = await this.pickupShiftBlock(booking);
      if (block) throw new ConflictError(block, 'SHIFT_NOT_ALLOWED');
      const cfg = await platformConfigService.get();
      const vehicle = await vehicleService.getForBooking(booking.vehicleId);
      const newStart = new Date(newStartIso);
      const allowed = pickupShiftChoices(booking.period.start, booking.period.end, cfg.tripChanges.pickupShiftMaxHours, vehicle.minTripHours);
      if (isNaN(newStart.getTime()) || !allowed.some((d) => d.getTime() === newStart.getTime())) {
        throw new ValidationError('Pick one of the offered pickup times.');
      }
      const at = new Date();
      // The booked days stay held: a later start sits inside them, so no other guest is affected.
      const res = await BookingModel.updateOne(
        { _id: bookingId, version: booking.version, status: booking.status },
        {
          $set: { 'period.start': newStart },
          $unset: { reminderSentAt: 1 },
          $inc: { version: 1 },
          $push: {
            changes: {
              kind: 'pickup_shift',
              at,
              by: userId,
              from: { start: booking.period.start, end: booking.period.end, vehicleId: booking.vehicleId },
              to: { start: newStart, end: booking.period.end, vehicleId: booking.vehicleId },
            },
            statusHistory: { from: booking.status, to: booking.status, at, by: userId, reason: `Pickup moved to ${newStart.toISOString()}` },
          },
        },
      );
      if (res.matchedCount === 0) throw new ConflictError('This trip changed while you were choosing. Please try again.', 'VERSION_CONFLICT');
      emit(EVENTS.BOOKING_PICKUP_SHIFTED, bookingId, {
        bookingId, guestId: booking.guestId, hostId: booking.hostId, from: booking.period.start, to: newStart,
      });
      return toPublicBooking(await this.getDoc(bookingId));
    });
  }

  /** Why these dates cannot be moved, or null. Settles everything that does not need a price. */
  async moveBlock(booking: BookingDoc): Promise<{ reason: string; payment?: undefined } | { reason?: undefined; payment: PaymentDoc }> {
    const rules = (await platformConfigService.get()).tripChanges;
    if (rules.freeMovesPerTrip <= 0) return { reason: 'Changing dates online is not available right now.' };
    if (!['paid', 'confirmed'].includes(booking.status) || booking.tripId) return { reason: 'Only a confirmed trip that has not started can change dates.' };
    if (booking.delivery) return { reason: 'This trip is delivered to you. Message support to change its dates.' };
    if ((booking.extensions?.length ?? 0) > 0) return { reason: 'This trip was extended, so its dates can only be changed by our team.' };
    if (this.changesOf(booking, ['move', 'switch_car']) >= rules.freeMovesPerTrip) return { reason: 'You have already changed this trip once. To change it again, cancel and book new dates.' };
    if (booking.period.start.getTime() - Date.now() < rules.moveMinLeadHours * HOUR_MS) {
      return { reason: `Dates can be changed up to ${rules.moveMinLeadHours} hours before pickup.` };
    }
    // One settled payment keeps the price difference exact on the receipt, the payout and the books.
    const payments = await PaymentModel.find({ bookingId: booking._id, type: 'booking' }).lean<PaymentDoc[]>();
    const [payment] = payments;
    if (payments.length !== 1 || payment.status !== 'succeeded' || !payment.ledgerTxnId || payment.refundedAmount > 0 || (payment.walletApplied ?? 0) > 0) {
      return { reason: 'This trip’s payment can’t be adjusted online. Message support and we’ll change it for you.' };
    }
    return { payment };
  }

  private async moveQuote(booking: BookingDoc, start: Date, end: Date): Promise<PriceBreakdown> {
    const pb = booking.priceBreakdown;
    const base = {
      vehicleId: booking.vehicleId,
      start,
      end,
      guestId: booking.guestId,
      protectionPlan: pb.protectionPlan,
      addOnCodes: (pb.selectedAddOns ?? []).map((a) => a.code),
    };
    // A coupon that was valid at booking keeps applying; one that no longer prices just drops off.
    if (booking.couponCode) {
      try {
        return await pricingService.quote({ ...base, couponCode: booking.couponCode });
      } catch {
        /* priced without it below */
      }
    }
    return pricingService.quote(base);
  }

  private async validateMoveDates(booking: BookingDoc, startIso: string, endIso: string): Promise<{ start: Date; end: Date }> {
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) throw new ValidationError('Pick a return time after the pickup time.');
    if (start.getTime() === booking.period.start.getTime() && end.getTime() === booking.period.end.getTime()) {
      throw new ValidationError('Pick dates different from your current trip.');
    }
    const cfg = await platformConfigService.get();
    if (start.getTime() - Date.now() < cfg.booking.minLeadMinutes * 60_000) throw new ValidationError('The new pickup is too soon. Pick a later time.');
    await this.assertBookableWindow(booking.vehicleId, start, end);
    const eligibility = await eligibilityService.evaluate(booking.guestId, end);
    if (!eligibility.eligible) throw new ConflictError('Your verification does not cover the new dates. Update your documents first.', 'NOT_ELIGIBLE');
    return { start, end };
  }

  /** The price difference for new dates on the same car, without moving anything. */
  async movePreview(
    userId: string,
    bookingId: string,
    startIso: string,
    endIso: string,
  ): Promise<{ available: boolean; reason?: string; newTotal?: Money; difference?: Money; start: string; end: string }> {
    const booking = await this.getDoc(bookingId);
    if (booking.guestId !== userId) throw new ForbiddenError('Not your booking');
    const block = await this.moveBlock(booking);
    if (block.reason !== undefined) return { available: false, reason: block.reason, start: startIso, end: endIso };
    try {
      const { start, end } = await this.validateMoveDates(booking, startIso, endIso);
      const free = (await availabilityService.blockingRows(booking.vehicleId, start, end, { excludeBookingId: booking._id })).length === 0;
      if (!free) return { available: false, reason: 'The car is not free on those dates. Try other dates or switch to a similar car.', start: startIso, end: endIso };
      const quote = await this.moveQuote(booking, start, end);
      const currency = quote.total.currency;
      return {
        available: true,
        newTotal: quote.total,
        difference: { amount: quote.total.amount - booking.priceBreakdown.total.amount, currency },
        start: start.toISOString(),
        end: end.toISOString(),
      };
    } catch (err) {
      if (err instanceof ValidationError || err instanceof ConflictError) return { available: false, reason: err.message, start: startIso, end: endIso };
      throw err;
    }
  }

  /**
   * Move the trip to new dates on the same car. The new days are held before the old ones are let go,
   * the difference is charged or refunded, and the booking only changes once the money has moved.
   */
  async moveDates(userId: string, bookingId: string, startIso: string, endIso: string): Promise<BookingDoc> {
    return this.withChangeLock(bookingId, async () => {
      const booking = await this.getDoc(bookingId);
      if (booking.guestId !== userId) throw new ForbiddenError('Not your booking');
      const block = await this.moveBlock(booking);
      if (block.reason !== undefined) throw new ConflictError(block.reason, 'MOVE_NOT_ALLOWED');
      const { payment } = block;
      const { start, end } = await this.validateMoveDates(booking, startIso, endIso);
      const quote = await this.moveQuote(booking, start, end);
      const pb = booking.priceBreakdown;
      const diff = quote.total.amount - pb.total.amount;
      const currency = pb.total.currency;
      const nth = this.changesOf(booking, ['move', 'switch_car']) + 1;

      const detached = await availabilityService.detachBooking(bookingId);
      let holdId: string;
      try {
        holdId = await availabilityService.placeHold(booking.vehicleId, start, end);
      } catch (err) {
        await availabilityService.restoreRows(detached);
        if ((err as { code?: string }).code === 'NOT_AVAILABLE') {
          throw new ConflictError('The car is not free on those dates any more. Try other dates.', 'NOT_AVAILABLE');
        }
        throw err;
      }

      const undo = async () => {
        await availabilityService.releaseHold(holdId).catch(() => undefined);
        await availabilityService.restoreRows(detached).catch((err) => logger.error({ err, bookingId }, 'could not restore trip days after a failed move'));
      };

      // Host, platform and tax keep the same shares of what the guest pays, so the payout matches the books exactly.
      const paidSplit = { hostEarnings: payment.hostEarnings, commission: payment.commission, tax: payment.tax };
      let hostEarnings = pb.hostEarnings.amount;
      let paymentId: string | undefined;
      try {
        if (diff > 0) {
          const part = scaleSplit(paidSplit, payment.amount, diff);
          const key = `${bookingId}-move-${nth}`;
          const charge = await paymentService.chargeForBooking({
            bookingId,
            guestId: booking.guestId,
            hostId: booking.hostId,
            capture: true,
            total: { amount: diff, currency },
            hostEarnings: { amount: part.hostEarnings, currency },
            commission: { amount: part.commission, currency },
            tax: { amount: part.tax, currency },
            ...(payment.insurerId ? { insurer: { id: payment.insurerId, share: Math.round((diff * (payment.insurerShare ?? 0)) / payment.amount) } } : {}),
            idempotencyKey: key,
          });
          if (charge.status !== 'succeeded') {
            await paymentService.cancelByKey(key).catch(() => undefined);
            throw new ConflictError('We couldn’t charge the difference to your card, so your trip was not changed. Check your card and try again.', 'PAYMENT_INCOMPLETE');
          }
          paymentId = charge.paymentId;
          hostEarnings += part.hostEarnings;
        } else if (diff < 0) {
          await paymentService.refundBooking(bookingId, { amount: -diff, currency }, `Trip ${booking.code} moved to dates that cost less`);
          hostEarnings -= Math.round((-diff * payment.hostEarnings) / payment.amount);
        }
      } catch (err) {
        await undo();
        throw err;
      }

      await availabilityService.confirmHold(holdId, bookingId);
      const at = new Date();
      const res = await BookingModel.updateOne(
        { _id: bookingId, version: booking.version },
        {
          $set: {
            'period.start': start,
            'period.end': end,
            priceBreakdown: { ...quote, hostEarnings: { amount: Math.max(0, hostEarnings), currency } },
          },
          $unset: { reminderSentAt: 1, returnRemindersSent: 1, nextBookingAlertedAt: 1 },
          $inc: { version: 1 },
          $push: {
            changes: {
              kind: 'move',
              at,
              by: userId,
              from: { start: booking.period.start, end: booking.period.end, vehicleId: booking.vehicleId },
              to: { start, end, vehicleId: booking.vehicleId },
              difference: { amount: diff, currency },
              ...(paymentId ? { paymentId } : {}),
            },
            statusHistory: { from: booking.status, to: booking.status, at, by: userId, reason: `Dates moved to ${start.toISOString()} – ${end.toISOString()}` },
          },
        },
      );
      if (res.matchedCount === 0) {
        // The money and days already moved; staff reconcile rather than the guest being charged and left on old dates.
        logger.error({ bookingId, diff }, 'trip move committed money but the booking changed underneath it');
        emit(EVENTS.BOOKING_SWAP_FAILED, bookingId, { bookingId, extenderBookingId: bookingId, stage: 'move_dates', error: 'version conflict after payment' });
      }
      // A deposit held for the old dates would lapse before the new pickup; it is taken again at handover.
      await depositService.release(bookingId, 'Trip dates changed').catch(() => undefined);
      emit(EVENTS.BOOKING_MOVED, bookingId, {
        bookingId,
        guestId: booking.guestId,
        hostId: booking.hostId,
        from: booking.period,
        to: { start, end },
        difference: { amount: diff, currency },
      });
      return toPublicBooking(await this.getDoc(bookingId));
    });
  }

  /** Similar cars free on the same dates at the same price, for a guest who wants a different car. */
  async switchOptions(userId: string, bookingId: string): Promise<{ available: boolean; reason?: string; vehicles: VehicleDoc[] }> {
    const booking = await this.getDoc(bookingId);
    if (booking.guestId !== userId) throw new ForbiddenError('Not your booking');
    const reason = await this.switchBlock(booking);
    if (reason) return { available: false, reason, vehicles: [] };
    const plan = await this.swapPlanFor(booking, await this.switchPolicy(), true);
    if (!plan) return { available: false, reason: 'No similar car is free on your dates at the same price right now.', vehicles: [] };
    return { available: true, vehicles: plan.options.slice(0, 6).map((o) => o.candidate) };
  }

  async switchBlock(booking: BookingDoc): Promise<string | null> {
    const rules = (await platformConfigService.get()).tripChanges;
    if (!rules.switchCarEnabled) return 'Switching cars online is not available right now.';
    if (!['paid', 'confirmed'].includes(booking.status) || booking.tripId) return 'Only a confirmed trip that has not started can switch cars.';
    if (this.changesOf(booking, ['move', 'switch_car']) >= Math.max(1, rules.freeMovesPerTrip)) return 'You have already changed this trip once.';
    if (booking.period.start.getTime() - Date.now() < rules.moveMinLeadHours * HOUR_MS) {
      return `Cars can be switched up to ${rules.moveMinLeadHours} hours before pickup.`;
    }
    return null;
  }

  /** The same price band the platform already uses when it moves a guest: the guest never pays more. */
  private async switchPolicy() {
    const ext = (await platformConfigService.get()).extension;
    return { swapPolicy: 'auto' as const, swapPriceToleranceBps: ext.swapPriceToleranceBps, swapMaxAbsorbCents: ext.swapMaxAbsorbCents };
  }

  async switchCar(userId: string, bookingId: string, vehicleId: string): Promise<BookingDoc> {
    return this.withChangeLock(bookingId, async () => {
      const booking = await this.getDoc(bookingId);
      if (booking.guestId !== userId) throw new ForbiddenError('Not your booking');
      const reason = await this.switchBlock(booking);
      if (reason) throw new ConflictError(reason, 'SWITCH_NOT_ALLOWED');
      const plan = await this.swapPlanFor(booking, await this.switchPolicy(), true);
      const chosen = plan?.options.find((o) => o.candidate._id === vehicleId);
      if (!plan || !chosen) throw new ConflictError('That car is no longer available for your dates. Pick another.', 'NOT_AVAILABLE');
      // Only the car the guest picked: never a different one behind their back.
      await this.moveVehicle({ ...plan, options: [chosen] }, { reason: 'guest_switch', causeBookingId: bookingId }, async () => undefined);
      const at = new Date();
      await BookingModel.updateOne(
        { _id: bookingId },
        {
          $push: {
            changes: {
              kind: 'switch_car',
              at,
              by: userId,
              from: { start: booking.period.start, end: booking.period.end, vehicleId: booking.vehicleId },
              to: { start: booking.period.start, end: booking.period.end, vehicleId },
              difference: { amount: 0, currency: booking.priceBreakdown.total.currency },
            },
          },
        },
      );
      await depositService.release(bookingId, 'Guest switched cars').catch(() => undefined);
      return toPublicBooking(await this.getDoc(bookingId));
    });
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
    return toPublicBooking(await this.getDoc(bookingId));
  }

  async removeDriver(userId: string, bookingId: string, name: string): Promise<BookingDoc> {
    const booking = await this.getDoc(bookingId);
    if (booking.guestId !== userId) throw new ForbiddenError('Only the guest can remove drivers');
    await BookingModel.updateOne({ _id: bookingId }, { $pull: { additionalDrivers: { name } } });
    return toPublicBooking(await this.getDoc(bookingId));
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
    // A booking that ends without being used gives its coupon back; release is idempotent.
    if (['cancelled', 'cancelled_guest', 'cancelled_host', 'cancelled_system', 'declined', 'expired'].includes(to)) {
      void couponService.release(booking._id).catch((err) => logger.warn({ err, bookingId: booking._id }, 'coupon release failed'));
    }
  }

  /** The booking's hold if it is still there, else a fresh one on the same dates (throws if they are gone). */
  private async ensureHold(booking: BookingDoc): Promise<string> {
    if (booking.holdId && (await availabilityService.holdExists(booking.holdId))) return booking.holdId;
    const holdId = await availabilityService.placeHold(booking.vehicleId, booking.period.start, booking.period.end);
    await BookingModel.updateOne({ _id: booking._id }, { holdId });
    return holdId;
  }

  /** Money was captured but the dates could not be secured: give it all back and end the booking. */
  private async cancelCapturedBooking(booking: BookingDoc, reason: string): Promise<void> {
    await paymentService.refundBooking(booking._id, booking.priceBreakdown.total, reason);
    await this.transition(booking, 'cancelled_system', 'system', reason);
    emit(EVENTS.BOOKING_CANCELLED, booking._id, {
      bookingId: booking._id,
      guestId: booking.guestId,
      hostId: booking.hostId,
      cancelledBy: 'system',
      refund: booking.priceBreakdown.total,
    });
  }

  /** Undo a claim made by transition() when the money step after it failed. */
  private async revertTransition(booking: BookingDoc, to: BookingStatus): Promise<void> {
    await BookingModel.updateOne(
      { _id: booking._id, status: to, version: booking.version + 1 },
      {
        $set: { status: booking.status },
        $inc: { version: 1 },
        $push: { statusHistory: { from: to, to: booking.status, at: new Date(), by: 'system', reason: 'Refund failed — cancellation rolled back' } },
      },
    ).catch((err) => logger.error({ err, bookingId: booking._id }, 'could not roll back a failed cancellation'));
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
