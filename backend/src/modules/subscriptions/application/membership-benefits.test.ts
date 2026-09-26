jest.mock('../../payments/infrastructure/gateway.provider', () => ({ paymentGateway: {} }));

import { subscriptionService } from './subscription.service';
import { rewardsService } from '../../rewards/application/rewards.service';
import { RewardEntryModel } from '../../rewards/infrastructure/reward.model';
import { UserSubscriptionModel } from '../infrastructure/subscription.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

const DAY = 86_400_000;
const sub = (over: Record<string, unknown> = {}) =>
  UserSubscriptionModel.create({
    userId: 'u1', planCode: 'plus', status: 'active', pricePaidCents: 999, renewsAt: new Date(Date.now() + 10 * DAY),
    benefitsSnapshot: { bookingDiscountBps: 1000, waiveSurge: true, waiveServiceFee: true, rewardsMultiplierBps: 20000 }, ...over,
  });

describe('membership benefits', () => {
  it('a member has the benefits they bought, a non-member has none', async () => {
    await sub();
    expect(await subscriptionService.benefitsFor('u1')).toMatchObject({ bookingDiscountBps: 1000, waiveSurge: true, waiveServiceFee: true });
    expect(await subscriptionService.benefitsFor('nobody')).toMatchObject({ bookingDiscountBps: 0, waiveServiceFee: false });
  });

  it('a cancelled membership keeps its benefits until the paid period ends, then loses them', async () => {
    const s = await sub({ status: 'cancelled' });
    expect((await subscriptionService.benefitsFor('u1')).bookingDiscountBps).toBe(1000);
    await UserSubscriptionModel.updateOne({ _id: s._id }, { renewsAt: new Date(Date.now() - DAY) });
    expect((await subscriptionService.benefitsFor('u1')).bookingDiscountBps).toBe(0);
  });

  it('doubles trip points for a member, but not for a non-member', async () => {
    await sub();
    await rewardsService.award('u1', 100, 'earn', 'booking', 'b1', 'Trip');
    await rewardsService.award('u2', 100, 'earn', 'booking', 'b2', 'Trip');
    const p1 = (await RewardEntryModel.findOne({ userId: 'u1' }).lean())!.points;
    const p2 = (await RewardEntryModel.findOne({ userId: 'u2' }).lean())!.points;
    expect(p1).toBe(p2 * 2);
  });
});
