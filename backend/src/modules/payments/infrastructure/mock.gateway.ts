import { randomId } from '../../../shared/utils/uuid';
import type {
  PaymentGateway,
  CreateIntentInput,
  IntentResult,
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
    const status = input.capture ? 'succeeded' : 'requires_capture';
    this.intents.set(intentId, { status, captured: input.capture });
    return { intentId, clientSecret: `${intentId}_secret`, status: status as IntentResult['status'] };
  }

  async capture(intentId: string): Promise<{ status: 'succeeded' }> {
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
}
