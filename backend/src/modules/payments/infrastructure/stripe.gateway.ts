import Stripe from 'stripe';
import { config } from '../../../config';
import { ExternalServiceError } from '../../../core/errors/app-error';
import type {
  PaymentGateway,
  CreateIntentInput,
  IntentResult,
} from '../domain/payment-gateway';

/**
 * Real Stripe implementation of the PaymentGateway interface. Amounts are in
 * minor units already (Money.amount), which is exactly what Stripe expects.
 * Selected at boot when STRIPE_SECRET_KEY is present.
 */
export class StripeGateway implements PaymentGateway {
  private readonly stripe: Stripe;

  constructor(secretKey: string) {
    // Pin via env/dashboard; omitting uses the account's default API version.
    this.stripe = new Stripe(secretKey);
  }

  async createIntent(input: CreateIntentInput): Promise<IntentResult> {
    try {
      const intent = await this.stripe.paymentIntents.create(
        {
          amount: input.amount.amount,
          currency: input.amount.currency.toLowerCase(),
          capture_method: input.capture ? 'automatic' : 'manual',
          metadata: { userId: input.userId, ...input.metadata },
        },
        { idempotencyKey: input.idempotencyKey },
      );
      return {
        intentId: intent.id,
        clientSecret: intent.client_secret ?? '',
        status:
          intent.status === 'succeeded'
            ? 'succeeded'
            : intent.status === 'requires_capture'
              ? 'requires_capture'
              : 'requires_confirmation',
      };
    } catch (err) {
      throw new ExternalServiceError(`Stripe createIntent failed: ${(err as Error).message}`);
    }
  }

  async capture(intentId: string): Promise<{ status: 'succeeded' }> {
    await this.stripe.paymentIntents.capture(intentId);
    return { status: 'succeeded' };
  }

  async refund(intentId: string, amount: { amount: number }, idempotencyKey: string): Promise<{ refundId: string }> {
    const refund = await this.stripe.refunds.create(
      { payment_intent: intentId, amount: amount.amount },
      { idempotencyKey },
    );
    return { refundId: refund.id };
  }

  async cancel(intentId: string): Promise<{ status: 'cancelled' }> {
    await this.stripe.paymentIntents.cancel(intentId);
    return { status: 'cancelled' };
  }

  /** Verify + parse a Stripe webhook (raw body + signature). */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    if (!config.stripe.webhookSecret) throw new ExternalServiceError('Stripe webhook secret not configured');
    return this.stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
  }
}
