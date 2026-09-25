import { PayoutModel, type PayoutDoc } from '../infrastructure/payout.model';
import { bookingService } from '../../bookings/application/booking.service';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { connectService } from './connect.service';
import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { logger } from '../../../infrastructure/logging/logger';
import { PaymentModel } from '../../payments/infrastructure/payment.model';
import { payoutReadinessService } from './payout-readiness.service';
import { ConflictError } from '../../../core/errors/app-error';
import { uuid } from '../../../shared/utils/uuid';
import { platformConfigService } from '../../platform-config/application/platform-config.service';

// Hold window and instant-payout fee come from PlatformConfig — finance tunes
// them from the admin panel, no deploy.

export class PayoutService {
  /** Called on BOOKING_COMPLETED: schedule the host's earnings for payout. */
  async scheduleForBooking(bookingId: string): Promise<void> {
    const booking = await bookingService.getDoc(bookingId);
    const existing = await PayoutModel.findOne({ bookingId, kind: { $ne: 'extra' } }).lean();
    if (existing) return; // idempotent
    const cfg = await platformConfigService.get();

    // Reputation-scaled hold: a new host's earnings are held longer (fraud /
    // chargeback protection); an established host is paid on the normal window.
    const priorTrips = await BookingModel.countDocuments({ hostId: booking.hostId, status: 'completed' });
    const extraHours = priorTrips < cfg.payoutTrust.newHostTripThreshold ? cfg.payoutTrust.newHostExtraHoldHours : 0;
    const holdHours = cfg.payout.holdHours + extraHours;

    await PayoutModel.create({
      hostId: booking.hostId,
      bookingId,
      amount: booking.priceBreakdown.hostEarnings.amount,
      currency: booking.priceBreakdown.currency,
      status: 'scheduled',
      scheduledFor: new Date(Date.now() + holdHours * 3_600_000),
    });
    emit(EVENTS.PAYOUT_SCHEDULED, bookingId, { bookingId, hostId: booking.hostId });
    logger.info({ bookingId, hostId: booking.hostId }, 'Payout scheduled');
  }

  /**
   * A crash mid-payout leaves rows claimed but never finished. Put them back so the next run retries; that is safe because the transfer and the ledger post are both keyed on the payout id.
   */
  async releaseStaleClaims(olderThanMs: number): Promise<number> {
    const res = await PayoutModel.updateMany(
      { status: 'processing', updatedAt: { $lte: new Date(Date.now() - olderThanMs) } },
      { status: 'scheduled', lastError: 'Released after an interrupted payout run', $unset: { claimToken: 1 } },
    );
    return res.modifiedCount;
  }

  /** Pay the host money collected after the main payout was scheduled. */
  async scheduleExtra(bookingId: string, hostId: string, amount: number, currency: string, tag: string, minHoldHours = 0): Promise<void> {
    if (amount <= 0) return;
    if (await PayoutModel.exists({ tag })) return; // replayed event
    const cfg = await platformConfigService.get();
    await PayoutModel.create({
      tag,
      hostId,
      bookingId,
      amount,
      currency,
      kind: 'extra',
      status: 'scheduled',
      // A charge the guest may still dispute is not paid out before that window closes.
      scheduledFor: new Date(Date.now() + Math.max(cfg.payout.holdHours, minHoldHours) * 3_600_000),
    });
    logger.info({ bookingId, hostId, amount }, 'Extra payout scheduled');
  }

  /**
   * A guest cancelled late and the policy kept part of the money. The host's
   * share of what was kept is theirs — otherwise the platform pockets a host's
   * lost booking. Idempotent per booking.
   */
  async scheduleRetainedShare(bookingId: string): Promise<void> {
    const payments = await PaymentModel.find({
      bookingId,
      type: 'booking',
      status: { $in: ['succeeded', 'partially_refunded'] },
    }).lean();
    let share = 0;
    let currency = 'USD';
    for (const p of payments) {
      const kept = p.amount - p.refundedAmount;
      if (kept > 0 && p.amount > 0) share += Math.round((kept * p.hostEarnings) / p.amount);
      currency = p.currency;
    }
    if (share <= 0) return;
    const booking = await bookingService.getDoc(bookingId);
    await this.scheduleExtra(bookingId, booking.hostId, share, currency, `retained_${bookingId}`);
  }

  /**
   * A chargeback opened: the host must not be paid out of a charge the bank is
   * pulling back. Returns false when the payout has already gone out, which
   * ops must chase manually.
   */
  async holdForBooking(bookingId: string, reason: string): Promise<boolean> {
    const held = await PayoutModel.updateOne(
      { bookingId, status: 'scheduled' },
      { status: 'held', lastError: reason.slice(0, 300) },
    );
    return held.modifiedCount > 0;
  }

  /** The dispute closed: pay the host if the bank sided with us, otherwise write the payout off. */
  async resolveHold(bookingId: string, won: boolean): Promise<void> {
    await PayoutModel.updateOne(
      { bookingId, status: 'held' },
      won
        ? { status: 'scheduled', $unset: { lastError: 1 } }
        : { status: 'failed', lastError: 'Chargeback lost — funds reversed by the card network' },
    );
  }

  /** Atomically take ownership of scheduled rows; only the rows this call flipped come back. */
  private async claim(filter: Record<string, unknown>): Promise<PayoutDoc[]> {
    const claimToken = uuid();
    await PayoutModel.updateMany({ ...filter, status: 'scheduled' }, { status: 'processing', claimToken });
    return PayoutModel.find({ status: 'processing', claimToken }).lean<PayoutDoc[]>();
  }

  /** Give a claimed row back to the queue with the reason it did not go out. */
  private async release(payoutId: string, reason: string): Promise<void> {
    await PayoutModel.updateOne(
      { _id: payoutId, status: 'processing' },
      { status: 'scheduled', lastError: reason.slice(0, 300), $unset: { claimToken: 1 } },
    );
  }

  /**
   * Send one claimed payout: transfer first, then the ledger, keyed on the payout
   * so a replay can neither pay a host twice nor post twice. `fee` is the instant fee.
   */
  private async settle(payout: PayoutDoc, fee = 0, instant = false): Promise<boolean> {
    const net = payout.amount - fee;
    try {
      let providerRef: string | undefined;
      if (connectService.enabled) {
        const { transferId } = await connectService.transfer(
          payout.hostId,
          { amount: net, currency: payout.currency },
          `payout_${payout._id}`,
          `Payout to host ${payout.hostId}`,
        );
        providerRef = transferId;
      }
      const txnId = await ledgerService.post({
        txnId: `payout_${payout._id}`,
        refType: instant ? 'instant_payout' : 'payout',
        refId: payout._id,
        currency: payout.currency,
        description: `${instant ? 'Instant payout' : 'Payout'} to host ${payout.hostId}${fee > 0 ? ` (fee ${fee})` : ''}`,
        legs: [
          { account: Account.hostPayable(payout.hostId), direction: 'credit', amount: payout.amount },
          { account: Account.gatewayClearing(), direction: 'debit', amount: net },
          ...(fee > 0 ? [{ account: Account.platformRevenue(), direction: 'debit' as const, amount: fee }] : []),
        ],
      });
      await PayoutModel.updateOne(
        { _id: payout._id },
        { status: 'paid', paidAt: new Date(), ledgerTxnId: txnId, ...(providerRef ? { providerRef } : {}), ...(instant ? { instant: true } : {}), $unset: { claimToken: 1, lastError: 1 } },
      );
      return true;
    } catch (err) {
      await this.release(payout._id, (err as Error).message);
      logger.error({ hostId: payout.hostId, payoutId: payout._id, err: (err as Error).message }, 'payout failed — left scheduled');
      return false;
    }
  }

  /**
   * Instant payout: an established host cashes out their scheduled trip earnings
   * immediately (bypassing the hold window) for a small fee. New hosts, extras and
   * held (disputed) payouts are excluded, and the host must be payout-ready.
   */
  async instantPayout(hostId: string, userId: string): Promise<{ paidCount: number; gross: number; fee: number; net: number }> {
    const cfg = await platformConfigService.get();
    const priorTrips = await BookingModel.countDocuments({ hostId, status: 'completed' });
    if (priorTrips < cfg.payoutTrust.newHostTripThreshold) {
      throw new ConflictError('Instant payout unlocks after your first completed trips.', 'INSTANT_PAYOUT_NOT_ELIGIBLE');
    }
    if (!(await payoutReadinessService.forHost(userId)).ready) {
      throw new ConflictError('Finish your payout setup before cashing out.', 'PAYOUT_NOT_READY');
    }

    const due = await this.claim({ hostId, kind: { $ne: 'extra' } });
    const gross = due.reduce((s, p) => s + p.amount, 0);
    if (gross <= 0) {
      for (const p of due) await this.release(p._id, 'nothing to pay');
      return { paidCount: 0, gross: 0, fee: 0, net: 0 };
    }
    const totalFee = Math.min(gross, Math.max(cfg.payout.instantFeeMinCents, Math.round((gross * cfg.payout.instantFeeBps) / 10000)));

    let paidGross = 0;
    let paidFee = 0;
    let paidCount = 0;
    let feeLeft = totalFee;
    for (const p of due) {
      // Proportional fee per payout; the last one absorbs rounding.
      const fee = p === due[due.length - 1] ? feeLeft : Math.round((totalFee * p.amount) / gross);
      feeLeft -= fee;
      if (await this.settle(p, fee, true)) {
        paidGross += p.amount;
        paidFee += fee;
        paidCount += 1;
      }
    }
    logger.info({ hostId, paidGross, paidFee }, 'instant payout executed');
    return { paidCount, gross: paidGross, fee: paidFee, net: paidGross - paidFee };
  }

  /** Execute all due scheduled payouts for a host (finance-triggered / cron). */
  async runForHost(hostId: string): Promise<{ paid: number; amount: number }> {
    const due = await this.claim({ hostId, scheduledFor: { $lte: new Date() } });
    let total = 0;
    let paid = 0;
    for (const payout of due) {
      if (await this.settle(payout)) {
        total += payout.amount;
        paid += 1;
      }
    }
    return { paid, amount: total };
  }

  async listForHost(hostId: string): Promise<PayoutDoc[]> {
    return PayoutModel.find({ hostId }).sort({ createdAt: -1 }).limit(100).lean<PayoutDoc[]>();
  }

  /** Cron entry: run payouts for every host with due scheduled payouts. */
  async runAllDue(): Promise<{ hosts: number; paid: number; amount: number }> {
    const groups = await PayoutModel.aggregate<{ _id: string }>([
      { $match: { status: 'scheduled', scheduledFor: { $lte: new Date() } } },
      { $group: { _id: '$hostId' } },
    ]).exec();
    let paid = 0;
    let amount = 0;
    for (const g of groups) {
      const r = await this.runForHost(g._id);
      paid += r.paid;
      amount += r.amount;
    }
    return { hosts: groups.length, paid, amount };
  }
}

export const payoutService = new PayoutService();
