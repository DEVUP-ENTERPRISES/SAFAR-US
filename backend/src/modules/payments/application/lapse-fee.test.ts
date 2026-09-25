/** A guest who never finishes verification forfeits a small admin-set fee from the card hold; the rest is released. The gateway is mocked. */
const capture = jest.fn();
const cancel = jest.fn();
jest.mock('../infrastructure/gateway.provider', () => ({
  paymentGateway: { capture: (...a: unknown[]) => capture(...a), cancel: (...a: unknown[]) => cancel(...a) },
}));

import { paymentService } from './payment.service';
import { ledgerService } from './ledger.service';
import { Account } from '../domain/ledger.accounts';
import { PaymentModel } from '../infrastructure/payment.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  capture.mockReset().mockResolvedValue({ status: 'succeeded' });
  cancel.mockReset().mockResolvedValue(undefined);
});

const seed = (over: Record<string, unknown> = {}) =>
  PaymentModel.create({
    bookingId: 'b-1', userId: 'guest-1', hostId: 'host-1', type: 'booking', intentId: 'pi_1',
    amount: 30_000, currency: 'USD', hostEarnings: 24_000, commission: 5_000, tax: 1_000,
    status: 'authorized', idempotencyKey: 'k-1', ...over,
  });

describe('captureLapseFee', () => {
  it('keeps only the fee from the hold and records it as platform revenue', async () => {
    await seed();
    expect(await paymentService.captureLapseFee('b-1', 500)).toBe(500);
    expect(capture).toHaveBeenCalledWith('pi_1', 500);
    const p = await PaymentModel.findOne({ bookingId: 'b-1' }).lean();
    expect(p).toMatchObject({ status: 'succeeded', amount: 500, capturedAmount: 500, walletApplied: 0, hostEarnings: 0, commission: 500 });
    expect(await ledgerService.balance(Account.gatewayClearing())).toBe(500);
  });

  it('never keeps more than the card was holding', async () => {
    await seed({ amount: 300 });
    expect(await paymentService.captureLapseFee('b-1', 500)).toBe(300);
    expect(capture).toHaveBeenCalledWith('pi_1', 300);
  });

  it('releases the hold instead when the capture fails, so the guest is never charged for nothing', async () => {
    await seed();
    capture.mockRejectedValue(new Error('expired'));
    expect(await paymentService.captureLapseFee('b-1', 500)).toBe(0);
    expect(cancel).toHaveBeenCalledWith('pi_1');
    expect((await PaymentModel.findOne({ bookingId: 'b-1' }).lean())?.status).toBe('cancelled');
  });

  it('releases the hold when the fee is zero or there is no hold to capture', async () => {
    await seed();
    expect(await paymentService.captureLapseFee('b-1', 0)).toBe(0);
    expect(capture).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
  });
});
