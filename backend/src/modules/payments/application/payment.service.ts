import { PaymentMethodModel } from '../infrastructure/payment-method.model';
import { paymentMethodService } from './payment-method.service';
import { PaymentModel, type PaymentDoc } from '../infrastructure/payment.model';
import { paymentGateway } from '../infrastructure/gateway.provider';
import { ledgerService } from './ledger.service';
import { Account } from '../domain/ledger.accounts';
import { NotFoundError, ConflictError } from '../../../core/errors/app-error';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import type {
  IPaymentContract,
  ChargeBookingInput,
  ChargeResult,
} from '../../../core/contracts/payment.contract';
import type { Money } from '../../../core/types/money';

/**
 * Coordinates the gateway (money mover) and the ledger (money record).
 * The ledger is written only when funds are actually captured; the two are
 * reconciled, never assumed in sync.
 */
export class PaymentService implements IPaymentContract {
  async chargeForBooking(input: ChargeBookingInput): Promise<ChargeResult> {
    // Idempotency: a retry with the same key returns the existing payment.
    const existing = await PaymentModel.findOne({ idempotencyKey: input.idempotencyKey }).lean();
    if (existing) {
      const intent = await paymentGateway.createIntent({
        amount: input.total,
        userId: input.guestId,
        capture: input.capture,
        idempotencyKey: input.idempotencyKey,
      });
      return {
        paymentId: existing._id,
        intentId: existing.intentId,
        clientSecret: intent.clientSecret,
        status: existing.status,
      };
    }

    // Wallet funds part of the total; the card charges only the remainder.
    const cardAmount = Math.max(0, input.total.amount - (input.walletApplied ?? 0));

    // The guest's saved card, so the charge happens without asking for it
    // again. Absent one, the intent comes back needing confirmation and the
    // client collects a card there and then.
    const [card, customerId] = await Promise.all([
      PaymentMethodModel.findOne({ userId: input.guestId, isDefault: true })
        .lean<{ stripePaymentMethodId?: string }>(),
      paymentMethodService.customerFor(input.guestId).catch(() => null),
    ]);

    const intent = await paymentGateway.createIntent({
      amount: { amount: cardAmount, currency: input.total.currency },
      userId: input.guestId,
      capture: input.capture,
      idempotencyKey: input.idempotencyKey,
      metadata: { bookingId: input.bookingId, hostId: input.hostId },
      customerId: customerId ?? undefined,
      paymentMethodId: card?.stripePaymentMethodId,
    });

    /*
     * Status comes from the GATEWAY, not from what we intended.
     *
     * This previously recorded `succeeded` or `authorized` purely from
     * input.capture, so a declined card or a 3-D Secure challenge was still
     * written down as paid — a booking would confirm with no money taken. The
     * only status worth storing is the one the processor actually returned.
     */
    const status =
      intent.status === 'succeeded'
        ? 'succeeded'
        : intent.status === 'requires_capture'
          ? 'authorized'
          : 'pending';

    const payment = await PaymentModel.create({
      bookingId: input.bookingId,
      userId: input.guestId,
      hostId: input.hostId,
      type: 'booking',
      intentId: intent.intentId,
      amount: input.total.amount,
      currency: input.total.currency,
      hostEarnings: input.hostEarnings.amount,
      commission: input.commission.amount,
      tax: input.tax.amount,
      capturedAmount: status === 'succeeded' ? cardAmount : 0,
      status,
      idempotencyKey: input.idempotencyKey,
    });

    // The ledger only moves when money actually did.
    if (status === 'succeeded') {
      await this.postBookingLedger(payment);
      emit(EVENTS.PAYMENT_SUCCEEDED, input.bookingId, { bookingId: input.bookingId });
    }

    return {
      paymentId: payment._id,
      intentId: intent.intentId,
      clientSecret: intent.clientSecret,
      status: payment.status,
      // The client must finish a 3-D Secure challenge; the booking is not paid
      // until it does. Surfaced rather than swallowed.
      requiresAction: intent.status === 'requires_action' || intent.status === 'requires_confirmation',
    };
  }

  async captureBooking(bookingId: string): Promise<void> {
    const payment = await PaymentModel.findOne({ bookingId, type: 'booking' });
    if (!payment) throw new NotFoundError('Payment');
    if (payment.status === 'succeeded') return; // idempotent

    await paymentGateway.capture(payment.intentId);
    payment.status = 'succeeded';
    payment.capturedAmount = payment.amount;
    await payment.save();

    // Now that funds are captured, record the split in the ledger.
    await this.postBookingLedger(payment);
    emit(EVENTS.PAYMENT_SUCCEEDED, bookingId, { bookingId });
  }

  async refundBooking(bookingId: string, amount: Money, reason: string): Promise<void> {
    const payment = await PaymentModel.findOne({ bookingId, type: 'booking' });
    if (!payment) throw new NotFoundError('Payment');
    if (payment.refundedAmount + amount.amount > payment.capturedAmount) {
      throw new ConflictError('Refund exceeds captured amount', 'REFUND_TOO_LARGE');
    }

    await paymentGateway.refund(payment.intentId, amount, `refund_${bookingId}_${Date.now()}`);

    // Reverse money to the guest's wallet (fast, encourages re-booking).
    await ledgerService.post({
      refType: 'refund',
      refId: bookingId,
      currency: amount.currency,
      description: `Refund: ${reason}`,
      legs: [
        { account: Account.gatewayClearing(), direction: 'debit', amount: amount.amount },
        { account: Account.userWallet(payment.userId), direction: 'credit', amount: amount.amount },
      ],
    });

    payment.refundedAmount += amount.amount;
    payment.status =
      payment.refundedAmount >= payment.capturedAmount ? 'refunded' : 'partially_refunded';
    await payment.save();

    emit(EVENTS.PAYMENT_REFUNDED, bookingId, { bookingId, amount });
  }

  async cancelAuthorization(bookingId: string): Promise<void> {
    const payment = await PaymentModel.findOne({ bookingId, type: 'booking' });
    if (!payment) return;
    if (payment.status === 'authorized') {
      await paymentGateway.cancel(payment.intentId);
      payment.status = 'cancelled';
      await payment.save();
    }
  }

  private async postBookingLedger(payment: PaymentDoc): Promise<void> {
    if (payment.ledgerTxnId) return; // already posted (idempotent)
    const txnId = await ledgerService.post({
      refType: 'booking',
      refId: payment.bookingId!,
      currency: payment.currency,
      description: `Booking payment ${payment.bookingId}`,
      legs: [
        { account: Account.gatewayClearing(), direction: 'credit', amount: payment.amount },
        { account: Account.hostPayable(payment.hostId!), direction: 'debit', amount: payment.hostEarnings },
        { account: Account.platformRevenue(), direction: 'debit', amount: payment.commission },
        { account: Account.platformTax(), direction: 'debit', amount: payment.tax },
      ],
    });
    await PaymentModel.updateOne({ _id: payment._id }, { ledgerTxnId: txnId });
  }
}

export const paymentService = new PaymentService();
