jest.mock('../infrastructure/gateway.provider', () => ({ paymentGateway: {} }));
jest.mock('../../payouts/application/payout.service', () => ({ payoutService: { holdForBooking: jest.fn().mockResolvedValue(true) } }));

import { chargebackService } from './chargeback.service';
import { dashboardRefundService } from './dashboard-refund.service';
import { walletService } from '../../wallet/application/wallet.service';
import { ledgerService } from './ledger.service';
import { Account } from '../domain/ledger.accounts';
import { PaymentModel } from '../infrastructure/payment.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { eventBus } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

async function seedTopup(spent = 0) {
  await UserModel.collection.insertOne({ _id: 'u1' as never, status: 'active', roles: ['guest'] });
  await PaymentModel.create({ userId: 'u1', type: 'topup', intentId: 'pi_top', amount: 5_000, currency: 'USD', capturedAmount: 5_000, status: 'succeeded' });
  await ledgerService.post({ refType: 'wallet_topup', refId: 'x', currency: 'USD', description: 't', legs: [
    { account: Account.cardFunding(), direction: 'debit', amount: 5_000 },
    { account: Account.userWallet('u1'), direction: 'credit', amount: 5_000 },
  ] });
  if (spent) await ledgerService.post({ refType: 'spend', refId: 'y', currency: 'USD', description: 's', legs: [
    { account: Account.userWallet('u1'), direction: 'debit', amount: spent },
    { account: Account.cardFunding(), direction: 'credit', amount: spent },
  ] });
}

describe('wallet top-up chargeback', () => {
  it('debits what is left in the wallet, flags the account and reports the shortfall, once', async () => {
    await seedTopup(3_000);
    const events: unknown[] = [];
    eventBus.subscribe(EVENTS.WALLET_TOPUP_DISPUTED, async (e) => { events.push(e.payload); });

    expect(await chargebackService.onTopupDispute('dp_1', 'pi_top', 5_000)).toBe(true);
    await chargebackService.onTopupDispute('dp_1', 'pi_top', 5_000);

    expect(await walletService.balance('u1')).toBe(0);
    expect((await UserModel.findById('u1').lean())?.status).toBe('under_review');
    expect(events[0]).toMatchObject({ debited: 2_000, shortfall: 3_000 });
  });

  it('ignores a dispute that is not on a top-up', async () => {
    expect(await chargebackService.onTopupDispute('dp_2', 'pi_none', 100)).toBe(false);
  });
});

describe('dashboard refund reconciliation', () => {
  async function seedBooking(refundedAmount: number) {
    return PaymentModel.create({
      bookingId: 'b1', userId: 'g1', hostId: 'h1', type: 'booking', intentId: 'pi_b', amount: 10_000, currency: 'USD',
      hostEarnings: 8_000, commission: 1_500, tax: 500, capturedAmount: 10_000, refundedAmount, status: refundedAmount ? 'partially_refunded' : 'succeeded',
    });
  }

  it('is a no-op when Stripe agrees with what we already refunded', async () => {
    await seedBooking(4_000);
    expect(await dashboardRefundService.reconcile('pi_b', 4_000)).toBe(0);
    expect((await PaymentModel.findOne({ intentId: 'pi_b' }).lean())?.refundedAmount).toBe(4_000);
    expect(await ledgerService.balance(Account.gatewayClearing())).toBe(0);
  });

  it('records a dashboard refund once and reverses the ledger', async () => {
    await seedBooking(0);
    expect(await dashboardRefundService.reconcile('pi_b', 2_500)).toBe(2_500);
    expect(await dashboardRefundService.reconcile('pi_b', 2_500)).toBe(0);
    const p = await PaymentModel.findOne({ intentId: 'pi_b' }).lean();
    expect(p?.refundedAmount).toBe(2_500);
    expect(p?.status).toBe('partially_refunded');
    expect(await ledgerService.balance(Account.gatewayClearing())).toBe(-2_500);
  });
});
