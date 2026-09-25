import { logger } from '../../../infrastructure/logging/logger';
import { PaymentMethodModel } from '../infrastructure/payment-method.model';
import { paymentMethodService } from './payment-method.service';
import { PaymentModel, type PaymentDoc } from '../infrastructure/payment.model';
import { paymentGateway } from '../infrastructure/gateway.provider';
import { ledgerService } from './ledger.service';
import { Account, type LedgerLeg } from '../domain/ledger.accounts';
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
      // Look the intent up instead of creating it again: re-sending an idempotency key with different parameters is rejected by Stripe.
      const intent = existing.intentId.startsWith('wallet_')
        ? { clientSecret: '', status: 'succeeded' as const }
        : await paymentGateway.retrieveIntent(existing.intentId);
      return {
        paymentId: existing._id,
        intentId: existing.intentId,
        clientSecret: intent.clientSecret,
        status: existing.status,
        requiresAction: intent.status === 'requires_action',
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

    // A wallet-funded total has no card leg — Stripe rejects a zero-amount intent.
    const intent =
      cardAmount > 0
        ? await paymentGateway.createIntent({
            amount: { amount: cardAmount, currency: input.total.currency },
            userId: input.guestId,
            capture: input.capture,
            idempotencyKey: input.idempotencyKey,
            metadata: { bookingId: input.bookingId, hostId: input.hostId },
            customerId: customerId ?? undefined,
            paymentMethodId: card?.stripePaymentMethodId,
          })
        : { intentId: `wallet_${input.idempotencyKey}`, clientSecret: '', status: 'succeeded' as const };

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
      walletApplied: input.walletApplied ?? 0,
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
      /*
       * ONLY a 3-D Secure challenge. `requires_confirmation` was included here
       * too, but that state is not a challenge — it is an intent that was never
       * confirmed because the guest had no saved card. The client answers this
       * flag with stripe.handleNextAction(), which is valid only for
       * requires_action and throws an IntegrationError on anything else, so
       * every cardless booking crashed the checkout instead of asking for a
       * card. Those bookings are already held as pending_payment by the caller.
       */
      requiresAction: intent.status === 'requires_action',
    };
  }

  async captureBooking(bookingId: string): Promise<void> {
    const payment = await PaymentModel.findOne({ bookingId, type: 'booking' });
    if (!payment) throw new NotFoundError('Payment');
    if (payment.status === 'succeeded') return; // idempotent

    await paymentGateway.capture(payment.intentId);
    payment.status = 'succeeded';
    payment.capturedAmount = payment.amount - (payment.walletApplied ?? 0);
    await payment.save();

    // Now that funds are captured, record the split in the ledger.
    await this.postBookingLedger(payment);
    emit(EVENTS.PAYMENT_SUCCEEDED, bookingId, { bookingId });
  }

  /**
   * Refund `amount` of a booking, oldest payment first (an extension is a
   * second payment on the same booking). Each payment refunds what actually
   * came from its card back to the card, and only the wallet-funded part back
   * to the wallet, so the guest is never paid twice.
   */
  async refundBooking(bookingId: string, amount: Money, reason: string): Promise<void> {
    const payments = await PaymentModel.find({
      bookingId,
      type: 'booking',
      status: { $in: ['succeeded', 'partially_refunded'] },
    }).sort({ createdAt: 1 });
    if (!payments.length) throw new NotFoundError('Payment');

    const refundable = (p: PaymentDoc) => p.capturedAmount + (p.walletApplied ?? 0) - p.refundedAmount;
    if (payments.reduce((sum, p) => sum + refundable(p), 0) < amount.amount) {
      throw new ConflictError('Refund exceeds captured amount', 'REFUND_TOO_LARGE');
    }

    let remaining = amount.amount;
    for (const payment of payments) {
      const take = Math.min(remaining, refundable(payment));
      if (take <= 0) continue;
      await this.refundPayment(payment, take, amount.currency, reason);
      remaining -= take;
      if (remaining <= 0) break;
    }
    emit(EVENTS.PAYMENT_REFUNDED, bookingId, { bookingId, amount });
  }

  private async refundPayment(payment: PaymentDoc, take: number, currency: string, reason: string): Promise<void> {
    /*
     * Claim this refund step atomically before any money moves.
     *
     * Refunds arrive from more than one place — a cancellation, a resolved
     * dispute, a Stripe `charge.refunded` webhook — and two of them can land at
     * once. The update only succeeds if refundedAmount is still what we read, so
     * exactly one caller wins; a duplicate or concurrent refund fails the
     * condition and stops here, before it can refund at Stripe a second time.
     */
    const priorRefunded = payment.refundedAmount;
    const nextRefunded = priorRefunded + take;
    const walletApplied = payment.walletApplied ?? 0;
    const claimed = await PaymentModel.findOneAndUpdate(
      { _id: payment._id, refundedAmount: priorRefunded },
      {
        $set: {
          refundedAmount: nextRefunded,
          status: nextRefunded >= payment.capturedAmount + walletApplied ? 'refunded' : 'partially_refunded',
        },
      },
      { new: true },
    );
    if (!claimed) {
      throw new ConflictError('A refund for this booking is already being processed', 'REFUND_IN_PROGRESS');
    }

    // Card first, wallet-funded remainder last.
    const cardPart = Math.min(take, Math.max(0, payment.capturedAmount - Math.min(priorRefunded, payment.capturedAmount)));
    const walletPart = take - cardPart;

    try {
      // Deterministic key — NOT Date.now(): a retry of this exact step reuses it.
      if (cardPart > 0) {
        await paymentGateway.refund(payment.intentId, { amount: cardPart, currency }, `refund_${payment.intentId}_${priorRefunded}`);
      }

      // Reverse the booking's own legs in proportion, so host payable, revenue
      // and tax fall back with the refund instead of staying booked.
      const hostPart = Math.round((take * payment.hostEarnings) / payment.amount);
      const commissionPart = Math.round((take * payment.commission) / payment.amount);
      const taxPart = take - hostPart - commissionPart;
      const legs: LedgerLeg[] = [
        { account: Account.gatewayClearing(), direction: 'debit', amount: take },
        { account: Account.hostPayable(payment.hostId!), direction: 'credit', amount: hostPart },
        { account: Account.platformRevenue(), direction: 'credit', amount: commissionPart },
        { account: Account.platformTax(), direction: 'credit', amount: taxPart },
      ].filter((l) => l.amount > 0) as LedgerLeg[];
      if (walletPart > 0) {
        legs.push(
          { account: Account.cardFunding(), direction: 'debit', amount: walletPart },
          { account: Account.userWallet(payment.userId), direction: 'credit', amount: walletPart },
        );
      }
      await ledgerService.post({
        txnId: `refund_${payment._id}_${priorRefunded}`,
        refType: 'refund',
        refId: payment.bookingId!,
        currency,
        description: `Refund: ${reason}`,
        legs,
      });
    } catch (err) {
      // Money did not move — release the claim so the step can be retried; the
      // deterministic keys make a retry safe even if Stripe had partially succeeded.
      await PaymentModel.updateOne(
        { _id: payment._id },
        { $set: { refundedAmount: priorRefunded, status: priorRefunded > 0 ? 'partially_refunded' : 'succeeded' } },
      ).catch(() => undefined);
      throw err;
    }
  }

  /**
   * A card payment that needed the cardholder (3-D Secure, or a card entered at
   * checkout) succeeded after the booking was created. Books it exactly once:
   * only a payment still waiting flips, so a duplicate webhook is a no-op.
   */
  async recordIntentSucceeded(intentId: string): Promise<boolean> {
    const payment = await PaymentModel.findOneAndUpdate(
      { intentId, type: 'booking', status: { $in: ['pending', 'requires_action'] } },
      [{ $set: { status: 'succeeded', capturedAmount: { $subtract: ['$amount', { $ifNull: ['$walletApplied', 0] }] } } }],
      { new: true },
    );
    if (!payment) return false;
    await this.postBookingLedger(payment.toObject());
    return true;
  }

  /**
   * Resume a payment the guest has not finished: try their saved card, or hand
   * back what the client needs (a 3-D Secure secret, or "add a card").
   */
  async resume(bookingId: string): Promise<{ status: 'succeeded' | 'requires_action' | 'requires_payment_method'; clientSecret?: string }> {
    const payment = await PaymentModel.findOne({ bookingId, type: 'booking' }).sort({ createdAt: 1 });
    if (!payment) throw new NotFoundError('Payment');
    if (payment.status === 'succeeded' || payment.status === 'authorized') return { status: 'succeeded' };

    let intent = await paymentGateway.retrieveIntent(payment.intentId);
    if (intent.status === 'requires_payment_method' || intent.status === 'requires_confirmation') {
      const [card, customerId] = await Promise.all([
        PaymentMethodModel.findOne({ userId: payment.userId, isDefault: true }).lean<{ stripePaymentMethodId?: string }>(),
        paymentMethodService.customerFor(payment.userId).catch(() => null),
      ]);
      if (card?.stripePaymentMethodId && customerId) {
        intent = await paymentGateway
          .confirmIntent(payment.intentId, { customerId, paymentMethodId: card.stripePaymentMethodId })
          .catch(() => intent);
      }
    }
    if (intent.status === 'succeeded') {
      await this.recordIntentSucceeded(payment.intentId);
      return { status: 'succeeded' };
    }
    if (intent.status === 'requires_action') return { status: 'requires_action', clientSecret: intent.clientSecret };
    return { status: 'requires_payment_method' };
  }

  /**
   * Charge a guest's saved card for something that happens after booking
   * (overage, a toll, a late fee, damage). Never throws: a declined or absent
   * card is an expected outcome the caller decides how to handle, and the
   * idempotency key makes a retry of the same charge safe.
   */
  async chargeGuest(input: {
    bookingId: string;
    guestId: string;
    amount: number;
    currency: string;
    idempotencyKey: string;
  }): Promise<boolean> {
    const done = await PaymentModel.findOne({ idempotencyKey: input.idempotencyKey }).lean();
    if (done) return done.status === 'succeeded';

    const [card, customerId] = await Promise.all([
      PaymentMethodModel.findOne({ userId: input.guestId, isDefault: true }).lean<{ stripePaymentMethodId?: string }>(),
      paymentMethodService.customerFor(input.guestId).catch(() => null),
    ]);
    if (!card?.stripePaymentMethodId || !customerId) return false;

    try {
      const intent = await paymentGateway.createIntent({
        amount: { amount: input.amount, currency: input.currency },
        userId: input.guestId,
        capture: true,
        idempotencyKey: input.idempotencyKey,
        metadata: { bookingId: input.bookingId, kind: 'post_trip_charge' },
        customerId,
        paymentMethodId: card.stripePaymentMethodId,
      });
      if (intent.status !== 'succeeded') {
        // A bank challenge cannot be answered off-session; don't leave it open to be paid later.
        await paymentGateway.cancel(intent.intentId).catch(() => undefined);
        return false;
      }
      await PaymentModel.create({
        bookingId: input.bookingId,
        userId: input.guestId,
        type: 'charge',
        intentId: intent.intentId,
        amount: input.amount,
        currency: input.currency,
        capturedAmount: input.amount,
        status: 'succeeded',
        idempotencyKey: input.idempotencyKey,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Backup for a webhook that never arrived (or an endpoint that was misconfigured):
   * look at Stripe itself for every payment still waiting and bring our records in
   * line. A cleared payment books the money and confirms the trip through the same
   * event the webhook fires, so the two paths cannot drift apart.
   */
  async reconcilePending(olderThanMs: number, limit = 100): Promise<{ succeeded: number; authorized: number; cancelled: number }> {
    const waiting = await PaymentModel.find({
      type: 'booking',
      status: { $in: ['pending', 'requires_action'] },
      createdAt: { $lte: new Date(Date.now() - olderThanMs) },
      intentId: { $not: /^wallet_/ },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    const out = { succeeded: 0, authorized: 0, cancelled: 0 };
    for (const p of waiting) {
      try {
        const intent = await paymentGateway.retrieveIntent(p.intentId);
        if (intent.status === 'succeeded') {
          if (await this.recordIntentSucceeded(p.intentId)) {
            emit(EVENTS.PAYMENT_SUCCEEDED, p.bookingId!, { bookingId: p.bookingId });
            out.succeeded += 1;
          }
        } else if (intent.status === 'requires_capture') {
          await PaymentModel.updateOne({ _id: p._id, status: { $in: ['pending', 'requires_action'] } }, { status: 'authorized' });
          out.authorized += 1;
        } else if (intent.status === 'canceled') {
          await PaymentModel.updateOne({ _id: p._id, status: { $in: ['pending', 'requires_action'] } }, { status: 'cancelled' });
          out.cancelled += 1;
        }
      } catch (err) {
        logger.warn({ err: (err as Error).message, intentId: p.intentId }, 'payment reconciliation failed for one intent');
      }
    }
    return out;
  }

  /** Give back a post-trip charge that was upheld against the guest and then reversed. */
  async refundCharge(bookingId: string, key: string, via: 'card' | 'deposit', amount: number): Promise<void> {
    const source =
      via === 'card'
        ? await PaymentModel.findOne({ idempotencyKey: `charge_${key}`, type: 'charge' })
        : await PaymentModel.findOne({ bookingId, type: 'deposit' });
    if (!source) throw new NotFoundError('Payment');
    await paymentGateway.refund(source.intentId, { amount, currency: source.currency }, `refund_charge_${key}`);
    await PaymentModel.updateOne(
      { _id: source._id },
      { $inc: { refundedAmount: amount }, ...(via === 'card' ? { status: 'refunded' } : {}) },
    );
  }

  /** Abandon one specific unfinished payment (e.g. a failed extension) without touching the booking's main payment. */
  async cancelByKey(idempotencyKey: string): Promise<void> {
    const payment = await PaymentModel.findOne({ idempotencyKey });
    if (!payment || ['succeeded', 'cancelled', 'refunded'].includes(payment.status)) return;
    await paymentGateway.cancel(payment.intentId);
    payment.status = 'cancelled';
    await payment.save();
  }

  async cancelAuthorization(bookingId: string): Promise<void> {
    const payment = await PaymentModel.findOne({ bookingId, type: 'booking' });
    if (!payment) return;
    // An unfinished payment (3-D Secure, no card yet) must be cancelled too, or
    // the guest could complete it later and be charged for a trip that is gone.
    if (['authorized', 'pending', 'requires_action'].includes(payment.status)) {
      try {
        await paymentGateway.cancel(payment.intentId);
      } catch (err) {
        // The card cleared while we were cancelling: book it, then give it back.
        const intent = await paymentGateway.retrieveIntent(payment.intentId);
        if (intent.status !== 'succeeded') throw err;
        await this.recordIntentSucceeded(payment.intentId);
        await this.refundBooking(bookingId, { amount: payment.amount, currency: payment.currency }, 'Booking cancelled while payment was completing');
        return;
      }
      payment.status = 'cancelled';
      await payment.save();

      // Wallet money was spent up front; nothing was captured, so give it back.
      const walletApplied = payment.walletApplied ?? 0;
      if (walletApplied > 0) {
        await ledgerService.post({
          txnId: `wallet_restore_${payment._id}`,
          refType: 'wallet_restore',
          refId: bookingId,
          currency: payment.currency,
          description: 'Wallet funds returned: booking not completed',
          legs: [
            { account: Account.cardFunding(), direction: 'debit', amount: walletApplied },
            { account: Account.userWallet(payment.userId), direction: 'credit', amount: walletApplied },
          ],
        });
      }
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
