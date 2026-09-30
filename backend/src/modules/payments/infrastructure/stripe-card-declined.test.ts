import { StripeGateway } from './stripe.gateway';

const gatewayThrowing = (err: unknown) => {
  const g = new StripeGateway('sk_test_placeholder');
  (g as unknown as { stripe: { paymentIntents: { create: jest.Mock } } }).stripe = {
    paymentIntents: { create: jest.fn().mockRejectedValue(err) },
  };
  return g;
};
const input = { amount: { amount: 450, currency: 'USD' }, capture: false, userId: 'u', customerId: 'c', paymentMethodId: 'pm', idempotencyKey: 'k' };

describe('a card the bank declines', () => {
  it('tells the guest the billing ZIP does not match when that check failed', async () => {
    const g = gatewayThrowing({
      type: 'StripeCardError', code: 'card_declined', decline_code: 'generic_decline', message: 'Your card was declined.',
      payment_intent: { id: 'pi_1', last_payment_error: { payment_method: { card: { brand: 'discover', last4: '7546', checks: { address_postal_code_check: 'fail', cvc_check: 'pass' } } } } },
    });
    const err = await g.createIntent(input as never).catch((e) => e);
    expect(err).toMatchObject({ code: 'CARD_DECLINED', httpStatus: 402, message: expect.stringContaining('ZIP code') });
    expect(err.message).toContain('Discover ending 7546');
  });

  it('names insufficient funds, and never leaks Stripe wording', async () => {
    const g = gatewayThrowing({ type: 'StripeCardError', code: 'card_declined', decline_code: 'insufficient_funds', message: 'Your card has insufficient funds.' });
    const err = await g.createIntent(input as never).catch((e) => e);
    expect(err).toMatchObject({ code: 'CARD_DECLINED', message: expect.stringContaining('insufficient funds') });
    expect(err.message).not.toMatch(/stripe/i);
  });

  it('keeps a real outage as a server error', async () => {
    const g = gatewayThrowing({ type: 'StripeAPIError', message: 'Internal error' });
    await expect(g.createIntent(input as never)).rejects.toMatchObject({ code: 'EXTERNAL_SERVICE_ERROR', httpStatus: 502 });
  });
});
