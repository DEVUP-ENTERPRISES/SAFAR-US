import { BookingModel, type BookingDoc } from '../infrastructure/booking.model';
import { canTransition, type BookingStatus } from '../domain/booking-status';
import { computeRefund } from '../domain/cancellation-policy';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { documentComplianceService } from '../../documents/application/document-compliance.service';
import { searchService } from '../../search/application/search.service';
import { trustScoreService } from '../../risk/application/trust-score.service';
import type { VehicleDoc } from '../../vehicles/infrastructure/vehicle.model';
import { verifyPriceLock, issuePriceLock, type PriceLock } from '../../pricing/domain/price-lock';
import { vehicleService } from '../../vehicles/application/vehicle.service';
import { availabilityService } from '../../availability/application/availability.service';
import { eligibilityService } from './eligibility.service';
import { riskService } from '../../risk/application/risk.service';
import { userRepository } from '../../users/infrastructure/user.repository';
import { pricingService } from '../../pricing/application/pricing.service';
import { paymentService } from '../../payments/application/payment.service';
import { walletService } from '../../wallet/application/wallet.service';
import { couponService } from '../../coupons/application/coupon.service';
import { hostService } from '../../hosts/application/host.service';
import { NotFoundError, ConflictError, ForbiddenError, ValidationError } from '../../../core/errors/app-error';
import { uuid, randomId } from '../../../shared/utils/uuid';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { decodeCursor, cursorFilter, toPage } from '../../../shared/utils/pagination';
import type { Page, Principal } from '../../../core/types/common';
import type { Money } from '../../../core/types/money';
import type { PriceBreakdown } from '../../../core/contracts/pricing.contract';
import type { CreateBookingDto } from '../dto/booking.schemas';

const APPROVAL_WINDOW_MS = 24 * 60 * 60 * 1000;
const VERIFICATION_WINDOW_MS = 72 * 60 * 60 * 1000;

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
      ? issuePriceLock({ vehicleId: dto.vehicleId, guestId, start, end, breakdown })
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
    if (vehicle.hostId && guestId === (await this.hostUserId(vehicle.hostId))) {
      throw new ForbiddenError('You cannot book your own vehicle');
    }
    this.assertDuration(start, end, vehicle.minTripHours, vehicle.maxTripHours);

    // Advance notice: the host needs lead time before a trip can start. A start
    // sooner than that is rejected — checked against wall-clock now, not the
    // booking time, so a request that sat in a form for an hour is judged fresh.
    if (vehicle.advanceNoticeHours > 0) {
      const earliestStart = Date.now() + vehicle.advanceNoticeHours * 3_600_000;
      if (start.getTime() < earliestStart) {
        throw new ConflictError(
          `This car needs at least ${vehicle.advanceNoticeHours} hours' notice before a trip starts.`,
          'ADVANCE_NOTICE',
        );
      }
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

    // Reserve the slot BEFORE talking to the gateway (prevents double-booking
    // during the payment round-trip). Roll back on any downstream failure.
    const holdId = await availabilityService.placeHold(dto.vehicleId, start, end);
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
        hostEarnings: breakdown.hostEarnings,
        // Protection accrues to the platform, so it rides in the commission leg
        // — keeps the ledger balanced: total = hostEarnings + commission + tax.
        commission: {
          amount: breakdown.commission.amount + breakdown.protection.amount,
          currency: breakdown.currency,
        },
        tax: breakdown.tax,
        walletApplied,
        idempotencyKey: idempotencyKey ?? bookingId,
      });

      // Deduct the wallet portion (only after the card charge succeeded).
      if (walletApplied > 0) {
        await walletService.spend(guestId, walletApplied, 'booking', bookingId);
      }

      const status: BookingStatus = !eligibility.eligible
        ? 'pending_verification'
        : effectiveInstant
          ? 'paid'
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
          : new Date(Math.min(start.getTime(), now.getTime() + APPROVAL_WINDOW_MS)),
        idempotencyKey,
      });

      if (status === 'paid') {
        await availabilityService.confirmHold(holdId, bookingId);
      }
      if (dto.couponCode) await couponService.redeem(dto.couponCode);

      emit(EVENTS.BOOKING_CREATED, bookingId, {
        bookingId,
        guestId,
        hostId: vehicle.hostId,
        instantBook: vehicle.instantBook,
        verificationBlockers: eligibility.blockers,
      });
      if (status === 'paid') {
        emit(EVENTS.BOOKING_CONFIRMED, bookingId, { bookingId, guestId, hostId: vehicle.hostId });
      }

      return booking.toObject();
    } catch (err) {
      await availabilityService.releaseHold(holdId);
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
      if (booking.instantBook) {
        await paymentService.captureBooking(booking._id);
        await availabilityService.confirmHold(booking.holdId!, booking._id);
        await this.transition(doc, 'paid', guestId, 'Identity verified');
        emit(EVENTS.BOOKING_CONFIRMED, booking._id, {
          bookingId: booking._id,
          guestId,
          hostId: booking.hostId,
        });
      } else {
        await BookingModel.updateOne(
          { _id: booking._id },
          {
            approvalDeadline: new Date(
              Math.min(booking.period.start.getTime(), Date.now() + APPROVAL_WINDOW_MS),
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
    return this.getDoc(bookingId);
  }

  /** Guest or host cancels; refund computed by policy. */
  async cancel(principal: Principal, bookingId: string, reason: string): Promise<BookingDoc> {
    const booking = await this.getDoc(bookingId);
    const isGuest = booking.guestId === principal.userId;
    const isHost = await this.isHostOwner(principal.userId, booking.hostId);
    const isAdmin = principal.permissions.includes('booking:read:any') || principal.permissions.includes('*');
    if (!isGuest && !isHost && !isAdmin) throw new ForbiddenError('Cannot cancel this booking');

    if (!['pending_verification', 'pending_approval', 'confirmed', 'paid'].includes(booking.status)) {
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
    // A host cancel strands the guest — offer rebooking on a similar free car.
    if (isHost) {
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
    const earliest = new Date(booking.period.start).getTime() + cfg.noShow.graceHours * 3_600_000;
    if (Date.now() < earliest) {
      throw new ConflictError(`Wait until ${cfg.noShow.graceHours}h after the start time to declare a no-show.`, 'TOO_EARLY');
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
   * Rebooking protection — when the host cancels or no-shows, the guest is not
   * left stranded: we surface similar cars actually free for their exact dates
   * (same metro, same category first) and let them rebook in one tap.
   */
  async rebookingOptions(principal: Principal, bookingId: string): Promise<VehicleDoc[]> {
    const booking = await this.getDoc(bookingId);
    if (booking.guestId !== principal.userId) throw new ForbiddenError('Not your booking');
    return searchService.similarTo(booking.vehicleId, {
      start: booking.period.start,
      end: booking.period.end,
      limit: 6,
    });
  }

  async rebook(principal: Principal, bookingId: string, vehicleId: string): Promise<BookingDoc> {
    const booking = await this.getDoc(bookingId);
    if (booking.guestId !== principal.userId) throw new ForbiddenError('Not your booking');
    if (booking.status !== 'cancelled_host') {
      throw new ConflictError('Rebooking is offered only when the host cancelled or no-showed', 'NOT_REBOOKABLE');
    }
    if (vehicleId === booking.vehicleId) {
      throw new ValidationError('Pick a different car to rebook');
    }
    return this.create(
      principal.userId,
      { vehicleId, start: booking.period.start.toISOString(), end: booking.period.end.toISOString() } as CreateBookingDto,
      `rebook_${bookingId}_${vehicleId}`,
    );
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

  /**
   * What extending to a new end date would cost, and whether it is even
   * possible, without charging anything.
   *
   * Mirrors the arithmetic of requestExtension exactly so the number shown is
   * the number charged — same extra-day window, same pricing call.
   */
  async extensionPreview(
    userId: string,
    bookingId: string,
    newEndIso: string,
  ): Promise<{
    available: boolean;
    reason?: string;
    extraCost?: Money;
    newEnd: string;
  }> {
    const booking = await this.getDoc(bookingId);
    if (booking.guestId !== userId) throw new ForbiddenError('Only the guest can extend');

    const newEnd = new Date(newEndIso);
    if (isNaN(newEnd.getTime()) || newEnd <= booking.period.end) {
      return { available: false, reason: 'Pick a date after your current trip end.', newEnd: newEndIso };
    }
    if (!['paid', 'in_progress'].includes(booking.status)) {
      return { available: false, reason: 'Only an active trip can be extended.', newEnd: newEndIso };
    }

    const extraStart = new Date(booking.period.end.getTime() + 86_400_000);
    if (!(await availabilityService.isAvailable(booking.vehicleId, extraStart, newEnd))) {
      return {
        available: false,
        reason: 'The car is already booked for those extra days.',
        newEnd: newEnd.toISOString(),
      };
    }

    const extra = await pricingService.quote({
      vehicleId: booking.vehicleId,
      start: extraStart,
      end: newEnd,
    });
    return { available: true, extraCost: extra.total, newEnd: newEnd.toISOString() };
  }

  async requestExtension(userId: string, bookingId: string, newEndIso: string): Promise<BookingDoc> {
    const booking = await this.getDoc(bookingId);
    if (booking.guestId !== userId) throw new ForbiddenError('Only the guest can extend');
    if (!['paid', 'in_progress'].includes(booking.status)) {
      throw new ConflictError('Only active bookings can be extended', 'INVALID_STATE');
    }
    const newEnd = new Date(newEndIso);
    if (isNaN(newEnd.getTime()) || newEnd <= booking.period.end) {
      throw new ValidationError('New end must be after the current end');
    }
    // Extra days start the day after the current end.
    const extraStart = new Date(booking.period.end.getTime() + 86_400_000);
    if (!(await availabilityService.isAvailable(booking.vehicleId, extraStart, newEnd))) {
      throw new ConflictError('Vehicle is not available for the extended dates', 'NOT_AVAILABLE');
    }

    const extra = await pricingService.quote({ vehicleId: booking.vehicleId, start: extraStart, end: newEnd });
    const holdId = await availabilityService.placeHold(booking.vehicleId, extraStart, newEnd);
    try {
      await paymentService.chargeForBooking({
        bookingId,
        guestId: booking.guestId,
        hostId: booking.hostId,
        capture: true,
        total: extra.total,
        hostEarnings: extra.hostEarnings,
        commission: extra.commission,
        tax: extra.tax,
        idempotencyKey: `${bookingId}-ext-${newEnd.getTime()}`,
      });
      await availabilityService.confirmHold(holdId, bookingId);

      // Roll the extra into the booking totals (immutable-style accumulation).
      const pb = booking.priceBreakdown;
      await BookingModel.updateOne(
        { _id: bookingId },
        {
          $set: {
            'period.end': newEnd,
            'priceBreakdown.total.amount': pb.total.amount + extra.total.amount,
            'priceBreakdown.hostEarnings.amount': pb.hostEarnings.amount + extra.hostEarnings.amount,
            'priceBreakdown.commission.amount': pb.commission.amount + extra.commission.amount,
            'priceBreakdown.tax.amount': pb.tax.amount + extra.tax.amount,
            'priceBreakdown.days': pb.days + extra.days,
          },
          $push: { statusHistory: { from: booking.status, to: booking.status, at: new Date(), by: userId, reason: `Extended to ${newEnd.toISOString()}` } },
        },
      );
      emit(EVENTS.BOOKING_EXTENDED, bookingId, { bookingId, guestId: booking.guestId, hostId: booking.hostId, newEnd });
      return this.getDoc(bookingId);
    } catch (err) {
      await availabilityService.releaseHold(holdId);
      throw err;
    }
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
    const removed = await pricingService.quote({ vehicleId: booking.vehicleId, start: removedStart, end: booking.period.end });
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
    const removed = await pricingService.quote({ vehicleId: booking.vehicleId, start: removedStart, end: booking.period.end });
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
    const verificationCutoff = new Date(now.getTime() - VERIFICATION_WINDOW_MS);
    const due = await BookingModel.find({
      $or: [
        { status: 'pending_approval', approvalDeadline: { $lte: now } },
        { status: 'pending_verification', createdAt: { $lte: verificationCutoff } },
        // A held request whose trip has already started is dead regardless of
        // which clock it was on — nobody can take a car they missed.
        { status: 'pending_verification', 'period.start': { $lte: now } },
      ],
    }).lean<BookingDoc[]>();
    for (const b of due) {
      await paymentService.cancelAuthorization(b._id);
      if (b.holdId) await availabilityService.releaseHold(b.holdId);
      const doc = await this.getDoc(b._id);
      await this.transition(doc, 'expired', 'system', 'Approval window elapsed');
      emit(EVENTS.BOOKING_EXPIRED, b._id, { bookingId: b._id });
    }
    return due.length;
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
    if (!['pending_verification', 'pending_approval', 'confirmed', 'paid'].includes(booking.status)) {
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

  async count(filter: Record<string, unknown> = {}): Promise<number> {
    return BookingModel.countDocuments({ deletedAt: null, ...filter });
  }

  /** All bookings billed to an org within a period (consolidated invoicing). */
  async orgBookings(orgId: string, from?: Date, to?: Date): Promise<BookingDoc[]> {
    const filter: Record<string, unknown> = { orgId, deletedAt: null };
    if (from || to) {
      const range: Record<string, Date> = {};
      if (from) range.$gte = from;
      if (to) range.$lte = to;
      filter.createdAt = range;
    }
    return BookingModel.find(filter).sort({ createdAt: -1 }).lean<BookingDoc[]>();
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

  /** Gross Merchandise Value = sum of totals for paid+completed bookings. */
  async gmv(): Promise<number> {
    const [row] = await BookingModel.aggregate<{ total: number }>([
      { $match: { status: { $in: ['paid', 'in_progress', 'completed'] } } },
      { $group: { _id: null, total: { $sum: '$priceBreakdown.total.amount' } } },
    ]).exec();
    return row?.total ?? 0;
  }

  /** Daily bookings + GMV for the last N days (analytics chart). */
  async dailySeries(days = 14): Promise<{ day: string; bookings: number; gmv: number }[]> {
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await BookingModel.aggregate<{ _id: string; bookings: number; gmv: number }>([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          bookings: { $sum: 1 },
          gmv: {
            $sum: {
              $cond: [
                { $in: ['$status', ['paid', 'in_progress', 'completed']] },
                '$priceBreakdown.total.amount',
                0,
              ],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]).exec();
    // A day with no bookings produces no group, so the raw aggregate silently
    // omits it — the chart would then draw a quiet day adjacent to a busy one
    // as if they were consecutive. Fill the calendar so the axis tells the truth.
    const found = new Map(rows.map((r) => [r._id, r]));
    const series: { day: string; bookings: number; gmv: number }[] = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      const hit = found.get(day);
      series.push({ day, bookings: hit?.bookings ?? 0, gmv: hit?.gmv ?? 0 });
    }
    return series;
  }

  /**
   * Where demand actually is. Bookings don't carry a city or category of their
   * own — those live on the vehicle — so this joins through to the listing
   * rather than denormalising fields that could drift out of sync.
   */
  async demandBreakdown(
    days = 30,
  ): Promise<{ cities: { key: string; trips: number; gmv: number }[]; categories: { key: string; trips: number; gmv: number }[] }> {
    const since = new Date(Date.now() - days * 86_400_000);
    const stage = (key: string) => [
      { $match: { createdAt: { $gte: since } } },
      {
        $lookup: {
          from: 'vehicles', localField: 'vehicleId', foreignField: '_id', as: 'v',
        },
      },
      { $unwind: '$v' },
      {
        $group: {
          _id: { $ifNull: [`$v.${key}`, 'unknown'] },
          trips: { $sum: 1 },
          gmv: {
            $sum: {
              $cond: [
                { $in: ['$status', ['paid', 'in_progress', 'completed']] },
                '$priceBreakdown.total.amount',
                0,
              ],
            },
          },
        },
      },
      { $sort: { trips: -1 as const } },
      { $limit: 8 },
    ];

    const [cities, categories] = await Promise.all([
      BookingModel.aggregate<{ _id: string; trips: number; gmv: number }>(stage('location.city')).exec(),
      BookingModel.aggregate<{ _id: string; trips: number; gmv: number }>(stage('category')).exec(),
    ]);

    const shape = (rows: { _id: string; trips: number; gmv: number }[]) =>
      rows.map((r) => ({ key: r._id || 'unknown', trips: r.trips, gmv: r.gmv }));
    return { cities: shape(cities), categories: shape(categories) };
  }

  async statusBreakdown(): Promise<{ status: string; count: number }[]> {
    const rows = await BookingModel.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).exec();
    return rows.map((r) => ({ status: r._id, count: r.count }));
  }

  /** Per-vehicle completed-booking economics (fleet P&L). */
  async earningsByVehicle(
    vehicleIds: string[],
  ): Promise<Record<string, { trips: number; gross: number; commission: number; tax: number; hostEarnings: number }>> {
    if (vehicleIds.length === 0) return {};
    const rows = await BookingModel.aggregate<{
      _id: string;
      trips: number;
      gross: number;
      commission: number;
      tax: number;
      hostEarnings: number;
    }>([
      { $match: { vehicleId: { $in: vehicleIds }, status: 'completed' } },
      {
        $group: {
          _id: '$vehicleId',
          trips: { $sum: 1 },
          gross: { $sum: '$priceBreakdown.total.amount' },
          commission: { $sum: '$priceBreakdown.commission.amount' },
          tax: { $sum: '$priceBreakdown.tax.amount' },
          hostEarnings: { $sum: '$priceBreakdown.hostEarnings.amount' },
        },
      },
    ]).exec();
    const map: Record<string, { trips: number; gross: number; commission: number; tax: number; hostEarnings: number }> = {};
    for (const r of rows) {
      map[r._id] = { trips: r.trips, gross: r.gross, commission: r.commission, tax: r.tax, hostEarnings: r.hostEarnings };
    }
    return map;
  }

  /** Aggregated completed-trip stats for a set of vehicles (fleet analytics). */
  async completedStatsForVehicles(
    vehicleIds: string[],
  ): Promise<{ trips: number; revenue: number }> {
    const [row] = await BookingModel.aggregate<{ trips: number; revenue: number }>([
      { $match: { vehicleId: { $in: vehicleIds }, status: 'completed' } },
      {
        $group: {
          _id: null,
          trips: { $sum: 1 },
          revenue: { $sum: '$priceBreakdown.hostEarnings.amount' },
        },
      },
    ]).exec();
    return { trips: row?.trips ?? 0, revenue: row?.revenue ?? 0 };
  }

  // ── internals ────────────────────────────────────────────────────────
  async getDoc(bookingId: string): Promise<BookingDoc> {
    const b = await BookingModel.findOne({ _id: bookingId, deletedAt: null }).lean<BookingDoc>();
    if (!b) throw new NotFoundError('Booking');
    return b;
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
