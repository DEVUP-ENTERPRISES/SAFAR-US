/**
 * The backup for a Stripe webhook that never arrived: payments still waiting are
 * checked against Stripe itself and brought into line. The gateway is mocked so
 * a test can never reach the real processor.
 */
const retrieveIntent = jest.fn();
jest.mock('../infrastructure/gateway.provider', () => ({ paymentGateway: { retrieveIntent: (...a: unknown[]) => retrieveIntent(...a) } }));

import { paymentService } from './payment.service';
import { ledgerService } from './ledger.service';
import { Account } from '../domain/ledger.accounts';
import { PaymentModel } from '../infrastructure/payment.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  retrieveIntent.mockReset();
});

async function seed(intentId: string, status: 'pending' | 'requires_action' = 'pending') {
  return PaymentModel.create({
    bookingId: `b-${intentId}`,
    userId: 'guest-1',
    hostId: 'host-1',
    type: 'booking',
    intentId,
    amount: 10_000,
    currency: 'USD',
    hostEarnings: 8_000,
    commission: 1_500,
    tax: 500,
    status,
    idempotencyKey: `k-${intentId}`,
  });
}

describe('reconcilePending', () => {
  it('books a payment Stripe says succeeded even though no webhook told us', async () => {
    await seed('pi_1');
    retrieveIntent.mockResolvedValue({ intentId: 'pi_1', clientSecret: '', status: 'succeeded' });

    const out = await paymentService.reconcilePending(0);

    expect(out).toEqual({ succeeded: 1, authorized: 0, cancelled: 0 });
    const p = await PaymentModel.findOne({ intentId: 'pi_1' }).lean();
    expect(p?.status).toBe('succeeded');
    expect(p?.capturedAmount).toBe(10_000);
    expect(await ledgerService.balance(Account.gatewayClearing())).toBe(10_000);
  });

  it('marks a held-but-uncaptured card as authorised, and an abandoned intent as cancelled', async () => {
    await seed('pi_auth');
    await seed('pi_gone', 'requires_action');
    retrieveIntent.mockImplementation(async (id: string) => ({
      intentId: id,
      clientSecret: '',
      status: id === 'pi_auth' ? 'requires_capture' : 'canceled',
    }));

    const out = await paymentService.reconcilePending(0);

    expect(out).toEqual({ succeeded: 0, authorized: 1, cancelled: 1 });
    expect((await PaymentModel.findOne({ intentId: 'pi_auth' }).lean())?.status).toBe('authorized');
    expect((await PaymentModel.findOne({ intentId: 'pi_gone' }).lean())?.status).toBe('cancelled');
  });

  it('leaves a payment alone while Stripe still needs the cardholder', async () => {
    await seed('pi_wait', 'requires_action');
    retrieveIntent.mockResolvedValue({ intentId: 'pi_wait', clientSecret: 's', status: 'requires_action' });

    expect(await paymentService.reconcilePending(0)).toEqual({ succeeded: 0, authorized: 0, cancelled: 0 });
    expect((await PaymentModel.findOne({ intentId: 'pi_wait' }).lean())?.status).toBe('requires_action');
  });

  it('skips payments younger than the grace period, so the webhook gets its chance first', async () => {
    await seed('pi_new');
    retrieveIntent.mockResolvedValue({ intentId: 'pi_new', clientSecret: '', status: 'succeeded' });

    expect(await paymentService.reconcilePending(60 * 60_000)).toEqual({ succeeded: 0, authorized: 0, cancelled: 0 });
    expect(retrieveIntent).not.toHaveBeenCalled();
  });

  it('one failing lookup does not stop the rest', async () => {
    await seed('pi_bad');
    await seed('pi_ok');
    retrieveIntent.mockImplementation(async (id: string) => {
      if (id === 'pi_bad') throw new Error('stripe timeout');
      return { intentId: id, clientSecret: '', status: 'succeeded' };
    });

    const out = await paymentService.reconcilePending(0);

    expect(out.succeeded).toBe(1);
    expect((await PaymentModel.findOne({ intentId: 'pi_ok' }).lean())?.status).toBe('succeeded');
  });
});
