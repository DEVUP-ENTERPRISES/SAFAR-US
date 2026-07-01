import { CouponModel, type CouponDoc } from '../infrastructure/coupon.model';
import { ValidationError, ConflictError } from '../../../core/errors/app-error';
import { money, applyBps, type Money } from '../../../core/types/money';

export class CouponService {
  private async findValid(code: string): Promise<CouponDoc> {
    const coupon = await CouponModel.findOne({
      code: code.toUpperCase(),
      deletedAt: null,
    }).lean<CouponDoc>();
    if (!coupon) throw new ValidationError('Coupon not found', [{ field: 'couponCode', issue: 'invalid' }]);

    const now = new Date();
    if (coupon.status !== 'active' || now < coupon.validFrom || now > coupon.validTo) {
      throw new ValidationError('Coupon is not active', [{ field: 'couponCode', issue: 'expired' }]);
    }
    if (coupon.redeemedCount >= coupon.maxRedemptions) {
      throw new ValidationError('Coupon fully redeemed', [{ field: 'couponCode', issue: 'exhausted' }]);
    }
    return coupon;
  }

  /** Compute the discount for a coupon against a spend amount. */
  async computeDiscount(code: string, spend: Money): Promise<Money> {
    const coupon = await this.findValid(code);
    if (spend.amount < coupon.minSpend) {
      throw new ValidationError('Order below coupon minimum spend', [
        { field: 'couponCode', issue: 'min_spend' },
      ]);
    }
    let discount: Money;
    if (coupon.type === 'percent') {
      discount = applyBps(spend, coupon.valueBps);
    } else {
      discount = money(Math.min(coupon.amount, spend.amount), spend.currency);
    }
    return discount;
  }

  /** Called after a booking is confirmed to consume a redemption. */
  async redeem(code: string): Promise<void> {
    const res = await CouponModel.updateOne(
      { code: code.toUpperCase() },
      { $inc: { redeemedCount: 1 } },
    );
    if (res.matchedCount === 0) throw new ConflictError('Coupon redemption failed', 'COUPON_REDEEM');
  }
}

export const couponService = new CouponService();
