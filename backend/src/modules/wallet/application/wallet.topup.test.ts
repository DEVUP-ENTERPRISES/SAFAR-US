/**
 * A wallet top-up is money in the platform's books, so it may only happen after
 * the card was actually charged. Stripe and the card lookups are mocked; nothing
 * here can reach the real processor.
 */
const createIntent = jest.fn();
const cancel = jest.fn();
jest.mock('../../payments/infrastructure/gateway.provider', () => ({
  paymentGateway: { createIntent: (...a: unknown[]) => createIntent(...a), cancel: (...a: unknown[]) => cancel(...a) },
}));

const hasChargeableCard = jest.fn();
const savedCardFor = jest.fn();
jest.mock('../../payments/application/payment-method.service', () => ({
  paymentMethodService: {
    hasChargeableCard: (...a: unknown[]) => hasChargeableCard(...a),
    savedCardFor: (...a: unknown[]) => savedCardFor(...a),
  },
}));

import { walletService } from './wallet.service';
import { PaymentModel } from '../../payments/infrastructure/payment.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  createIntent.mockReset();
  cancel.mockReset().mockResolvedValue({ status: 'cancelled' });
  hasChargeableCard.mockReset().mockResolvedValue(true);
  savedCardFor.mockReset().mockResolvedValue({ customerId: 'cus_1', paymentMethodId: 'pm_1' });
});

describe('wallet top-up', () => {
  it('credits the wallet only after Stripe says the card was charged', async () => {
    createIntent.mockResolvedValue({ intentId: 'pi_ok', clientSecret: 's', status: 'succeeded' });

    const r = await walletService.topup('u1', 5_000);

    expect(r.balance).toBe(5_000);
    expect(createIntent).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'cus_1', paymentMethodId: 'pm_1', capture: true }));
    expect(await PaymentModel.countDocuments({ type: 'topup', status: 'succeeded' })).toBe(1);
  });

  it('credits nothing when the card is declined or needs a challenge, and voids the intent', async () => {
    createIntent.mockResolvedValue({ intentId: 'pi_wait', clientSecret: 's', status: 'requires_payment_method' });

    await expect(walletService.topup('u1', 5_000)).rejects.toMatchObject({ code: 'TOPUP_NOT_CHARGED' });

    expect(await walletService.balance('u1')).toBe(0);
    expect(await PaymentModel.countDocuments({ type: 'topup' })).toBe(0);
    expect(cancel).toHaveBeenCalledWith('pi_wait');
  });

  it('refuses a top-up when there is no saved card, without touching Stripe', async () => {
    hasChargeableCard.mockResolvedValue(false);

    await expect(walletService.topup('u1', 5_000)).rejects.toMatchObject({ code: 'PAYMENT_METHOD_REQUIRED' });

    expect(createIntent).not.toHaveBeenCalled();
    expect(await walletService.balance('u1')).toBe(0);
  });

  it('a Stripe failure credits nothing', async () => {
    createIntent.mockRejectedValue(new Error('stripe down'));

    await expect(walletService.topup('u1', 5_000)).rejects.toThrow('stripe down');

    expect(await walletService.balance('u1')).toBe(0);
  });

  it('two taps at once charge once', async () => {
    createIntent.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 30));
      return { intentId: `pi_${Math.random()}`, clientSecret: 's', status: 'succeeded' };
    });

    const results = await Promise.allSettled([walletService.topup('u1', 5_000), walletService.topup('u1', 5_000)]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await walletService.balance('u1')).toBe(5_000);
  });
});
