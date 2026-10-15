import { PaymentModel } from '../infrastructure/payment.model';
import { ledgerService } from './ledger.service';
import { Account, type LedgerLeg } from '../domain/ledger.accounts';
import { payoutService } from '../../payouts/application/payout.service';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { logger } from '../../../infrastructure/logging/logger';

export class DashboardRefundService {
  /**
   * Stripe says more was refunded than we recorded (a refund issued from the Stripe
   * dashboard): book the difference, reverse the ledger, hold the host's unpaid payout
   * and tell staff. Refunds we made ourselves already match, so they are a no-op.
   * Returns the newly recorded amount (0 = nothing to do).
   */
  async reconcile(intentId: string, stripeAmountRefunded: number): Promise<number> {
    const payment = await PaymentModel.findOne({ intentId, type: 'booking' });
    if (!payment) return 0;

    // Our own refunds take the card first, so the card part is refundedAmount capped at what was captured.
    const priorRefunded = payment.refundedAmount;
    const diff = stripeAmountRefunded - Math.min(priorRefunded, payment.capturedAmount);
    if (diff <= 0) return 0;

    const nextRefunded = priorRefunded + diff;
    const claimed = await PaymentModel.findOneAndUpdate(
      { _id: payment._id, refundedAmount: priorRefunded },
      { $set: { refundedAmount: nextRefunded, status: nextRefunded >= payment.capturedAmount + (payment.walletApplied ?? 0) ? 'refunded' : 'partially_refunded' } },
    );
    // Someone else moved this payment first; a replayed webhook will see the new figure.
    if (!claimed) return 0;

    try {
      const hostPart = Math.round((diff * payment.hostEarnings) / payment.amount);
      const commissionPart = Math.round((diff * payment.commission) / payment.amount);
      const legs = [
        { account: Account.gatewayClearing(), direction: 'debit', amount: diff },
        { account: Account.hostPayable(payment.hostId!), direction: 'credit', amount: hostPart },
        { account: Account.platformRevenue(), direction: 'credit', amount: commissionPart },
        { account: Account.platformTax(), direction: 'credit', amount: diff - hostPart - commissionPart },
      ].filter((l) => l.amount > 0) as LedgerLeg[];
      await ledgerService.post({
        txnId: `dashboard_refund_${payment._id}_${priorRefunded}`,
        refType: 'refund',
        refId: payment.bookingId!,
        currency: payment.currency,
        description: 'Refund issued from the Stripe dashboard',
        legs,
      });
    } catch (err) {
      await PaymentModel.updateOne({ _id: payment._id }, { $set: { refundedAmount: priorRefunded, status: payment.status } }).catch(() => undefined);
      throw err;
    }

    const held = await payoutService.holdForBooking(payment.bookingId!, 'Refund issued from the Stripe dashboard');
    logger.warn({ bookingId: payment.bookingId, diff, held }, 'refund issued outside the platform — reconciled');
    emit(EVENTS.PAYMENT_REFUNDED_EXTERNALLY, payment.bookingId!, { bookingId: payment.bookingId, amount: diff, currency: payment.currency, payoutHeld: held });
    return diff;
  }
}

export const dashboardRefundService = new DashboardRefundService();
