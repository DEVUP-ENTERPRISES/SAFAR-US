import { PayoutModel, type PayoutDoc } from '../infrastructure/payout.model';
import { bookingService } from '../../bookings/application/booking.service';
import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { logger } from '../../../infrastructure/logging/logger';

/** Payout hold window (protects against disputes/chargebacks). */
const PAYOUT_HOLD_MS = 24 * 60 * 60 * 1000;

export class PayoutService {
  /** Called on BOOKING_COMPLETED: schedule the host's earnings for payout. */
  async scheduleForBooking(bookingId: string): Promise<void> {
    const booking = await bookingService.getDoc(bookingId);
    const existing = await PayoutModel.findOne({ bookingId }).lean();
    if (existing) return; // idempotent

    await PayoutModel.create({
      hostId: booking.hostId,
      bookingId,
      amount: booking.priceBreakdown.hostEarnings.amount,
      currency: booking.priceBreakdown.currency,
      status: 'scheduled',
      scheduledFor: new Date(Date.now() + PAYOUT_HOLD_MS),
    });
    emit(EVENTS.PAYOUT_SCHEDULED, bookingId, { bookingId, hostId: booking.hostId });
    logger.info({ bookingId, hostId: booking.hostId }, 'Payout scheduled');
  }

  /** Execute all due scheduled payouts for a host (finance-triggered / cron). */
  async runForHost(hostId: string): Promise<{ paid: number; amount: number }> {
    const due = await PayoutModel.find({
      hostId,
      status: 'scheduled',
      scheduledFor: { $lte: new Date() },
    });

    let total = 0;
    for (const payout of due) {
      // Move funds out of host payable via the ledger (mock transfer).
      const txnId = await ledgerService.post({
        refType: 'payout',
        refId: payout._id,
        currency: payout.currency,
        description: `Payout to host ${hostId}`,
        legs: [
          { account: Account.hostPayable(hostId), direction: 'credit', amount: payout.amount },
          { account: Account.gatewayClearing(), direction: 'debit', amount: payout.amount },
        ],
      });
      payout.status = 'paid';
      payout.paidAt = new Date();
      payout.ledgerTxnId = txnId;
      await payout.save();
      total += payout.amount;
    }
    return { paid: due.length, amount: total };
  }

  async listForHost(hostId: string): Promise<PayoutDoc[]> {
    return PayoutModel.find({ hostId }).sort({ createdAt: -1 }).limit(100).lean<PayoutDoc[]>();
  }
}

export const payoutService = new PayoutService();
