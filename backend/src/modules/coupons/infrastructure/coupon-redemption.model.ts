import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/**
 * One row per actual redemption — who used which coupon, on which booking, and
 * how much it took off.
 *
 * This is what makes `perUserLimit` enforceable (there was no per-user record
 * before, so a "one per customer" coupon could be used forever), and it doubles
 * as the audit trail behind campaign reporting: real redemptions and real
 * discount spend, not a counter that can drift.
 */
export interface CouponRedemptionDoc {
  _id: string;
  couponId: string;
  code: string;
  userId: string;
  bookingId: string;
  /** Discount actually applied, in minor units. */
  discountAmount: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<CouponRedemptionDoc>(
  {
    _id: { type: String, default: () => uuid() },
    couponId: { type: String, required: true },
    code: { type: String, required: true, uppercase: true },
    userId: { type: String, required: true },
    bookingId: { type: String, required: true },
    discountAmount: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
  },
  { timestamps: true, _id: false },
);

// One redemption per booking per coupon — makes redeem() idempotent under
// retries, so a duplicated call can never double-spend a campaign's budget.
schema.index({ couponId: 1, bookingId: 1 }, { unique: true });
schema.index({ couponId: 1, userId: 1 });
schema.index({ userId: 1, createdAt: -1 });

export const CouponRedemptionModel = model<CouponRedemptionDoc>('CouponRedemption', schema);
