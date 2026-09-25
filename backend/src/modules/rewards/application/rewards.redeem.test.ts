jest.mock('../../payments/infrastructure/gateway.provider', () => ({ paymentGateway: {} }));

import { rewardsService } from './rewards.service';
import { RewardEntryModel } from '../infrastructure/reward.model';
import { walletService } from '../../wallet/application/wallet.service';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

describe('rewards redeem', () => {
  it('credits the wallet once when the same points are redeemed in parallel', async () => {
    await RewardEntryModel.create({ userId: 'u1', points: 1000, type: 'bonus' });

    const results = await Promise.allSettled(Array.from({ length: 8 }, () => rewardsService.redeem('u1', 1000)));

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await rewardsService.balance('u1')).toBe(0);
    const { pointValueCents } = (await rewardsService.summary('u1'));
    expect(await walletService.balance('u1')).toBe(1000 * pointValueCents);
  });

  it('refuses to redeem more than the balance', async () => {
    await RewardEntryModel.create({ userId: 'u2', points: 150, type: 'bonus' });
    await expect(rewardsService.redeem('u2', 1000)).rejects.toMatchObject({ code: 'INSUFFICIENT_POINTS' });
  });
});
