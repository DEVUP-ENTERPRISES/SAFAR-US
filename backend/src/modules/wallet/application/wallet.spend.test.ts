/**
 * Concurrent wallet spends: the balance check and the debit happen under one
 * lock, so parallel bookings can never spend more than the wallet holds.
 */
jest.mock('../../payments/infrastructure/gateway.provider', () => ({ paymentGateway: {} }));

import { walletService } from './wallet.service';
import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

async function fund(userId: string, amount: number) {
  await ledgerService.post({
    refType: 'wallet_topup',
    refId: 'seed',
    currency: 'USD',
    description: 'seed',
    legs: [
      { account: Account.cardFunding(), direction: 'debit', amount },
      { account: Account.userWallet(userId), direction: 'credit', amount },
    ],
  });
}

describe('spendUpTo', () => {
  it('parallel spends never take more than the balance', async () => {
    await fund('u1', 5_000);

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) => walletService.spendUpTo('u1', 3_000, 'booking', `b${i}`, `wallet_spend_b${i}`)),
    );
    const spent = results.reduce((s, r) => s + (r.status === 'fulfilled' ? r.value : 0), 0);

    expect(spent).toBeLessThanOrEqual(5_000);
    expect(await walletService.balance('u1')).toBe(5_000 - spent);
  });

  it('spends only what is there and reports it', async () => {
    await fund('u1', 1_200);
    expect(await walletService.spendUpTo('u1', 3_000, 'booking', 'b1', 'wallet_spend_b1')).toBe(1_200);
    expect(await walletService.spendUpTo('u1', 3_000, 'booking', 'b2', 'wallet_spend_b2')).toBe(0);
    expect(await walletService.balance('u1')).toBe(0);
  });
});
