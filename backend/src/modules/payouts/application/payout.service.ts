import { PayoutModel, type PayoutDoc } from '../infrastructure/payout.model';
import { bookingService } from '../../bookings/application/booking.service';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { logger } from '../../../infrastructure/logging/logger';
import { platformConfigService } from '../../platform-config/application/platform-config.service';

// Hold window and instant-payout fee come from PlatformConfig — finance tunes
// them from the admin panel, no deploy.

export class PayoutService {
  /** Called on BOOKING_COMPLETED: schedule the host's earnings for payout. */
  async scheduleForBooking(bookingId: string): Promise<void> {
    const booking = await bookingService.getDoc(bookingId);
    const existing = await PayoutModel.findOne({ bookingId }).lean();
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
   * Instant payout: a host cashes out ALL scheduled earnings immediately
   * (bypassing the hold window) for a small fee. Fee accrues to the platform.
   */
  async instantPayout(hostId: string): Promise<{ paidCount: number; gross: number; fee: number; net: number }> {
    const due = await PayoutModel.find({ hostId, status: 'scheduled' });
    const gross = due.reduce((s, p) => s + p.amount, 0);
    if (gross <= 0) return { paidCount: 0, gross: 0, fee: 0, net: 0 };

    const cfg = await platformConfigService.get();
    const fee = Math.max(
      cfg.payout.instantFeeMinCents,
      Math.round((gross * cfg.payout.instantFeeBps) / 10000),
    );
    const net = gross - fee;

    const txnId = await ledgerService.post({
      refType: 'instant_payout',
      refId: hostId,
      currency: 'USD',
      description: `Instant payout to host ${hostId} (fee ${fee})`,
      legs: [
        { account: Account.hostPayable(hostId), direction: 'credit', amount: gross },
        { account: Account.gatewayClearing(), direction: 'debit', amount: net },
        { account: Account.platformRevenue(), direction: 'debit', amount: fee },
      ],
    });

    const now = new Date();
    await PayoutModel.updateMany(
      { _id: { $in: due.map((p) => p._id) } },
      { status: 'paid', paidAt: now, ledgerTxnId: txnId, instant: true },
    );
    logger.info({ hostId, gross, fee, net }, '⚡ instant payout executed');
    return { paidCount: due.length, gross, fee, net };
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
