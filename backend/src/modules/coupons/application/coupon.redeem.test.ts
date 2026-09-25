import { couponService } from './coupon.service';
import { CouponModel } from '../infrastructure/coupon.model';
import { money } from '../../../core/types/money';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

const seed = (over: Record<string, unknown> = {}) =>
  CouponModel.create({ code: 'SAVE', type: 'fixed', amount: 1000, validTo: new Date(Date.now() + 86_400_000), ...over });

describe('coupon redemption', () => {
  it('never honours more than maxRedemptions under 10 parallel bookings', async () => {
    await seed({ maxRedemptions: 3, perUserLimit: 0 });

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => couponService.redeem('SAVE', { userId: `u${i}`, bookingId: `b${i}`, discount: money(1000, 'USD') })),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    const c = await CouponModel.findOne({ code: 'SAVE' }).lean();
    expect(c?.redeemedCount).toBe(3);
    expect(c?.spent).toBe(3000);
  });

  it('holds the budget and the per-user limit, and release gives the slot back', async () => {
    await seed({ budget: 1500, perUserLimit: 1 });
    await couponService.redeem('SAVE', { userId: 'a', bookingId: 'b1', discount: money(1000, 'USD') });
    await expect(couponService.redeem('SAVE', { userId: 'a', bookingId: 'b2', discount: money(100, 'USD') })).rejects.toMatchObject({ code: 'COUPON_PER_USER_LIMIT' });
    await expect(couponService.redeem('SAVE', { userId: 'b', bookingId: 'b3', discount: money(1000, 'USD') })).rejects.toMatchObject({ code: 'COUPON_EXHAUSTED' });

    await couponService.release('b1');
    await couponService.release('b1');
    const c = await CouponModel.findOne({ code: 'SAVE' }).lean();
    expect(c?.redeemedCount).toBe(0);
    expect(c?.spent).toBe(0);
  });
});
