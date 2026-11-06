import { randomId } from '../../../shared/utils/uuid';
import type {
  PaymentGateway,
  CreateIntentInput,
  IntentResult,
  IntentRisk,
  CreateCheckoutInput,
  CheckoutState,
} from '../domain/payment-gateway';

/**
 * Deterministic in-memory gateway for local dev / tests. Simulates the
 * Stripe intent lifecycle without network calls. Replace with StripeGateway
 * (same interface) in production by binding it in the composition root.
 */
export class MockGateway implements PaymentGateway {
  private readonly intents = new Map<string, { status: string; captured: boolean }>();

  async createIntent(input: CreateIntentInput): Promise<IntentResult> {
    const intentId = `pi_mock_${randomId()}`;
    const status = input.anyMethod ? 'requires_payment_method' : input.capture ? 'succeeded' : 'requires_capture';
    this.intents.set(intentId, { status, captured: input.capture });
    return { intentId, clientSecret: `${intentId}_secret`, status: status as IntentResult['status'] };
  }

  async capture(intentId: string, _amountCents?: number): Promise<{ status: 'succeeded' }> {
    const i = this.intents.get(intentId);
    if (i) {
      i.status = 'succeeded';
      i.captured = true;
    }
    return { status: 'succeeded' };
  }

  async refund(): Promise<{ refundId: string }> {
    return { refundId: `re_mock_${randomId()}` };
  }

  async cancel(intentId: string): Promise<{ status: 'cancelled' }> {
    const i = this.intents.get(intentId);
    if (i) i.status = 'cancelled';
    return { status: 'cancelled' };
  }

  async retrieveIntent(intentId: string): Promise<IntentResult> {
    const i = this.intents.get(intentId);
    return { intentId, clientSecret: `${intentId}_secret`, status: (i?.status ?? 'succeeded') as IntentResult['status'] };
  }

  async confirmIntent(intentId: string): Promise<IntentResult> {
    return this.retrieveIntent(intentId);
  }

  readonly checkouts = new Map<string, CheckoutState>();
  private readonly checkoutKeys = new Map<string, string>();

  async createCheckout(input: CreateCheckoutInput): Promise<{ sessionId: string; url: string }> {
    // Like Stripe, the same idempotency key returns the same page.
    const known = this.checkoutKeys.get(input.idempotencyKey);
    if (known) return { sessionId: known, url: `https://checkout.mock/${known}` };
    const sessionId = `cs_mock_${randomId()}`;
    this.checkoutKeys.set(input.idempotencyKey, sessionId);
    this.checkouts.set(sessionId, { status: 'open', paid: false, amountTotal: input.amountCents, metadata: input.metadata });
    return { sessionId, url: `https://checkout.mock/${sessionId}` };
  }

  async retrieveCheckout(sessionId: string): Promise<CheckoutState> {
    return this.checkouts.get(sessionId) ?? { status: 'expired', paid: false, amountTotal: 0, metadata: {} };
  }

  async expireCheckout(sessionId: string): Promise<void> {
    const c = this.checkouts.get(sessionId);
    if (c && c.status === 'open') c.status = 'expired';
  }

  async getIntentRisk(): Promise<IntentRisk | null> {
    return { riskLevel: 'normal', cvcCheck: 'pass', addressCheck: 'pass' };
  }
}
