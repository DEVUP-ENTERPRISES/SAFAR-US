import type { Money } from '../../../core/types/money';

/**
 * Payment provider abstraction. The service depends on this interface, not
 * on Stripe. Production binds StripeGateway; tests/local bind MockGateway.
 * Swapping providers never touches business logic.
 */
export interface CreateIntentInput {
  amount: Money;
  userId: string;
  capture: boolean; // true = capture now (instant book), false = authorize only
  idempotencyKey: string;
  metadata?: Record<string, string>;
  /** Stripe Customer + saved card. Both present = charge off-session, so the
   *  guest is not asked for a card they already gave us. */
  customerId?: string;
  paymentMethodId?: string;
}

export interface IntentResult {
  intentId: string;
  clientSecret: string;
  /** `requires_action` is 3-D Secure: the bank wants the cardholder present,
   *  and the client must finish it. Treating that as a failure would decline
   *  perfectly good European and increasingly US cards. */
  status: 'requires_confirmation' | 'requires_action' | 'succeeded' | 'requires_capture';
}

export interface PaymentGateway {
  createIntent(input: CreateIntentInput): Promise<IntentResult>;
    /** `amountCents` captures less than was authorised (deposit settlement). */
  capture(intentId: string, amountCents?: number): Promise<{ status: 'succeeded' }>;
  refund(intentId: string, amount: Money, idempotencyKey: string): Promise<{ refundId: string }>;
  cancel(intentId: string): Promise<{ status: 'cancelled' }>;
}
