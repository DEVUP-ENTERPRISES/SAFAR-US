import { BookingModel, type BookingDoc } from '../infrastructure/booking.model';
import { bookingService } from './booking.service';
import { serviceFeeOf, explainRefund } from '../domain/cancellation-policy';
import {
  CANCEL_REASONS,
  EXCEPTION_REASONS,
  creditBonus,
  inUndoWindow,
  type ExceptionReasonCode,
} from '../domain/trip-change-rules';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { paymentService } from '../../payments/application/payment.service';
import { PayoutModel } from '../../payouts/infrastructure/payout.model';
import { parseKey } from '../../../infrastructure/storage/storage.gateway';
import { ConflictError, ForbiddenError, ValidationError } from '../../../core/errors/app-error';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { logger } from '../../../infrastructure/logging/logger';
import type { Principal } from '../../../core/types/common';
import type { Money } from '../../../core/types/money';

const HOUR_MS = 3_600_000;
const CAPTURED = ['paid', 'confirmed'];

export interface ChangeOptions {
  bookingId: string;
  status: string;
  reasons: readonly string[];
  cancel: {
    cancellable: boolean;
    total: Money;
    refund: Money;
    nonRefundable: Money;
    isFullRefund: boolean;
    fullRefundUntil: string | null;
    undo: { active: boolean; endsAt: string | null };
    credit: { enabled: boolean; amount: Money; bonus: Money };
  };
  shift: { available: boolean; reason?: string; choices: string[] };
  move: { available: boolean; reason?: string };
  switchCar: { available: boolean; reason?: string };
  exception: { enabled: boolean; reasons: readonly string[]; proofRequired: boolean };
}

/**
 * Everything a guest can do instead of (or alongside) cancelling: the options screen, and the
 * review of late cancellations for reasons outside their control.
 */
export class TripChangeService {
  /** One call for the "Cancel or change trip" screen: every option, worked out by the server for right now. */
  async options(principal: Principal, bookingId: string): Promise<ChangeOptions> {
    const booking = await bookingService.getDoc(bookingId);
    if (booking.guestId !== principal.userId) throw new ForbiddenError('Not your booking');
    const cfg = await platformConfigService.get();
    const rules = cfg.tripChanges;
    const total = booking.priceBreakdown.total;
    const currency = total.currency;
    const captured = CAPTURED.includes(booking.status);
    const cancellable = ['pending_verification', 'pending_approval', 'pending_payment', ...CAPTURED].includes(booking.status);

    const undoEndsAt = captured ? await bookingService.undoWindowFor(booking) : null;
    const undoActive = inUndoWindow(undoEndsAt);
    // Nothing captured yet means nothing is kept: the hold on the card is simply released.
    const refundAmount = !captured || undoActive
      ? total.amount
      : explainRefund(booking.cancellationPolicy, total, booking.period.start, cfg.cancellation, new Date(), serviceFeeOf(booking.priceBreakdown)).refund.amount;
    const fullUntil = new Date(booking.period.start.getTime() - cfg.cancellation[booking.cancellationPolicy].fullBeforeHours * HOUR_MS);
    const bonus = captured && rules.creditEnabled ? creditBonus(refundAmount, rules.creditBonusBps) : 0;

    const [shift, moveBlock, switchBlock] = cancellable
      ? await Promise.all([
          bookingService.pickupShiftOptions(principal.userId, bookingId),
          bookingService.moveBlock(booking),
          bookingService.switchBlock(booking),
        ])
      : [{ available: false, choices: [] as string[] }, { reason: 'This trip can no longer be changed.' }, 'This trip can no longer be changed.'];

    return {
      bookingId,
      status: booking.status,
      reasons: CANCEL_REASONS,
      cancel: {
        cancellable,
        total,
        refund: { amount: refundAmount, currency },
        nonRefundable: { amount: captured ? total.amount - refundAmount : 0, currency },
        isFullRefund: refundAmount === total.amount,
        fullRefundUntil: fullUntil.getTime() > Date.now() ? fullUntil.toISOString() : null,
        undo: { active: undoActive, endsAt: undoActive && undoEndsAt ? undoEndsAt.toISOString() : null },
        credit: {
          enabled: captured && rules.creditEnabled && refundAmount > 0,
          amount: { amount: refundAmount + bonus, currency },
          bonus: { amount: bonus, currency },
        },
      },
      shift,
      move: moveBlock.reason !== undefined ? { available: false, reason: moveBlock.reason } : { available: true },
      switchCar: switchBlock ? { available: false, reason: switchBlock } : { available: true },
      exception: {
        enabled: rules.exceptionsEnabled && captured && refundAmount < total.amount,
        reasons: EXCEPTION_REASONS,
        proofRequired: rules.exceptionProofRequired,
      },
    };
  }

  /** The guest asks us to review a late cancellation (flight cancelled, weather, health) with proof. */
  async fileException(
    userId: string,
    bookingId: string,
    input: { reasonCode: ExceptionReasonCode; note?: string; proofKeys: string[] },
  ): Promise<BookingDoc> {
    const rules = (await platformConfigService.get()).tripChanges;
    if (!rules.exceptionsEnabled) throw new ConflictError('Exception requests are not available right now.', 'EXCEPTIONS_DISABLED');
    const booking = await bookingService.getDoc(bookingId);
    if (booking.guestId !== userId) throw new ForbiddenError('Not your booking');
    const c = booking.cancellation;
    if (booking.status !== 'cancelled_guest' || !c) throw new ConflictError('Cancel the trip first, then ask for an exception.', 'NOT_CANCELLED');
    if ((c.charged?.amount ?? 0) <= 0) throw new ConflictError('You already received a full refund for this trip.', 'NOTHING_KEPT');
    if (Date.now() - new Date(c.at).getTime() > rules.exceptionFileWindowHours * HOUR_MS) {
      throw new ConflictError(`Exceptions can be requested up to ${rules.exceptionFileWindowHours} hours after cancelling.`, 'WINDOW_CLOSED');
    }
    if (booking.exception) throw new ConflictError('You already asked for an exception on this trip.', 'ALREADY_REQUESTED');

    const proofKeys = [...new Set(input.proofKeys)];
    // Proof must be the guest's own private upload, never someone else's file or a public image.
    for (const key of proofKeys) {
      const parsed = parseKey(key);
      if (!parsed || parsed.category !== 'claim' || parsed.ownerId !== userId) throw new ValidationError('One of the files could not be attached. Upload it again.');
    }
    if (rules.exceptionProofRequired && proofKeys.length === 0) throw new ValidationError('Add a photo or PDF that shows what happened.');

    const since = new Date(Date.now() - 90 * 24 * HOUR_MS);
    const [recent, reused] = await Promise.all([
      BookingModel.countDocuments({ guestId: userId, 'exception.requestedAt': { $gte: since } }),
      proofKeys.length ? BookingModel.exists({ _id: { $ne: bookingId }, 'exception.proofKeys': { $in: proofKeys } }) : null,
    ]);
    const flagReason = reused
      ? 'The same file was used on another exception request.'
      : recent >= rules.exceptionFlagAfter
        ? `${recent} exception requests in the last 90 days.`
        : undefined;

    const res = await BookingModel.updateOne(
      { _id: bookingId, exception: { $exists: false } },
      {
        $set: {
          exception: {
            status: 'pending',
            reasonCode: input.reasonCode,
            note: input.note?.trim() || undefined,
            proofKeys,
            requestedAt: new Date(),
            ...(flagReason ? { flagged: true, flagReason } : {}),
          },
        },
      },
    );
    if (res.matchedCount === 0) throw new ConflictError('You already asked for an exception on this trip.', 'ALREADY_REQUESTED');

    // The host's share of the kept money waits for the decision instead of paying out meanwhile.
    await PayoutModel.updateOne({ tag: `retained_${bookingId}`, status: 'scheduled' }, { $set: { status: 'held', lastError: 'Waiting on the guest’s cancellation exception' } }).catch(() => undefined);
    emit(EVENTS.TRIP_EXCEPTION_REQUESTED, bookingId, { bookingId, guestId: userId, code: booking.code, reasonCode: input.reasonCode, flagged: !!flagReason });
    return bookingService.getDoc(bookingId);
  }

  /** Staff decide a pending exception: approve returns what was kept, partial returns part of it, reject returns nothing. */
  async decideException(
    actorId: string,
    bookingId: string,
    input: { decision: 'approved' | 'partial' | 'rejected'; amountCents?: number; note?: string },
  ): Promise<BookingDoc> {
    const booking = await bookingService.getDoc(bookingId);
    const ex = booking.exception;
    if (!ex || ex.status !== 'pending') throw new ConflictError('This request was already decided.', 'ALREADY_DECIDED');
    const kept = booking.cancellation?.charged?.amount ?? 0;
    const currency = booking.priceBreakdown.total.currency;
    const amount =
      input.decision === 'approved' ? kept : input.decision === 'partial' ? Math.floor(input.amountCents ?? 0) : 0;
    if (input.decision === 'partial' && (amount <= 0 || amount >= kept)) {
      throw new ValidationError(`A partial refund must be more than 0 and less than ${(kept / 100).toFixed(2)}.`);
    }

    // Claim the decision first, so two staff deciding at once cannot both refund.
    const at = new Date();
    const claim = await BookingModel.updateOne(
      { _id: bookingId, 'exception.status': 'pending' },
      {
        $set: {
          'exception.status': input.decision,
          'exception.decidedAt': at,
          'exception.decidedBy': actorId,
          'exception.decisionNote': input.note?.trim() || undefined,
          'exception.refund': { amount, currency },
          'cancellation.charged.amount': kept - amount,
        },
      },
    );
    if (claim.matchedCount === 0) throw new ConflictError('This request was already decided.', 'ALREADY_DECIDED');

    if (amount > 0) {
      try {
        await paymentService.refundBooking(bookingId, { amount, currency }, `Exception approved for ${booking.code}`);
      } catch (err) {
        await BookingModel.updateOne(
          { _id: bookingId },
          { $set: { 'exception.status': 'pending', 'cancellation.charged.amount': kept }, $unset: { 'exception.decidedAt': 1, 'exception.decidedBy': 1, 'exception.refund': 1 } },
        );
        throw err;
      }
    }
    await this.settleRetainedShare(bookingId, kept, kept - amount);
    emit(EVENTS.TRIP_EXCEPTION_DECIDED, bookingId, {
      bookingId,
      guestId: booking.guestId,
      code: booking.code,
      decision: input.decision,
      refund: { amount, currency },
      note: input.note?.trim() || undefined,
    });
    return bookingService.getDoc(bookingId);
  }

  /** The host's held share follows what is still kept; if it was somehow already paid, staff are told. */
  private async settleRetainedShare(bookingId: string, keptBefore: number, keptAfter: number): Promise<void> {
    const payout = await PayoutModel.findOne({ tag: `retained_${bookingId}` });
    if (!payout) return;
    if (payout.status === 'held' || payout.status === 'scheduled') {
      const amount = keptBefore > 0 ? Math.round((payout.amount * keptAfter) / keptBefore) : 0;
      // A share that would be zero was never paid, so it is removed rather than left as a failed payout.
      if (amount > 0) await PayoutModel.updateOne({ _id: payout._id }, { $set: { amount, status: 'scheduled' }, $unset: { lastError: 1 } });
      else await PayoutModel.deleteOne({ _id: payout._id, status: { $in: ['held', 'scheduled'] } });
    } else if (keptAfter < keptBefore) {
      logger.warn({ bookingId, payoutStatus: payout.status }, 'exception refunded after the host share was paid; platform covers the difference');
    }
  }

  async listExceptions(status: 'pending' | 'decided', limit = 50): Promise<BookingDoc[]> {
    const filter = status === 'pending' ? { 'exception.status': 'pending' } : { 'exception.status': { $in: ['approved', 'partial', 'rejected'] } };
    return BookingModel.find({ ...filter, deletedAt: null })
      .sort(status === 'pending' ? { 'exception.requestedAt': 1 } : { 'exception.decidedAt': -1 })
      .limit(Math.min(limit, 100))
      .lean<BookingDoc[]>();
  }
}

export const tripChangeService = new TripChangeService();
