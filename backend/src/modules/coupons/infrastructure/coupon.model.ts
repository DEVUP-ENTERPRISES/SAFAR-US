import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/**
 * A promotional code.
 *
 * Beyond a flat percent/fixed discount, a campaign can be targeted and
 * budget-capped — the controls a marketing team actually needs to run a promo
 * without it becoming an unbounded liability:
 *  - `maxDiscount` caps a percentage coupon ("20% off, up to $50"), so a big
 *    booking can't drain the campaign in one redemption
 *  - `budget` caps total discount spend across all redemptions
 *  - audience targeting (first-time guests, specific cities/vehicle categories)
 *  - trip-shape targeting (minimum trip days)
 */
export interface CouponDoc {
  _id: string;
  code: string;
  /** Internal label for the campaign, shown in the admin list. */
  campaign?: string;
  type: 'percent' | 'fixed';
  valueBps: number; // for percent (e.g. 1000 = 10%)
  amount: number; // for fixed (minor units)
  currency: string;
  minSpend: number;
  /** Cap on a percentage discount, in minor units. 0 = uncapped. */
  maxDiscount: number;
  /** Total discount the campaign may ever give away, minor units. 0 = unlimited. */
  budget: number;
  /** Discount given away so far, minor units — the budget counter. */
  spent: number;
  maxRedemptions: number;
  redeemedCount: number;
  perUserLimit: number;
  /** Restrict to guests who have never completed a booking. */
  firstTimeOnly: boolean;
  /** Minimum trip length in days (0 = any). */
  minTripDays: number;
  /** Restrict to these cities (case-insensitive). Empty = anywhere. */
  cities: string[];
  /** Restrict to these vehicle categories. Empty = any vehicle. */
  categories: string[];
  validFrom: Date;
  validTo: Date;
  status: 'active' | 'disabled';
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const schema = new Schema<CouponDoc>(
  {
    _id: { type: String, default: () => uuid() },
    code: { type: String, required: true, uppercase: true, trim: true },
    campaign: { type: String },
    type: { type: String, enum: ['percent', 'fixed'], required: true },
    valueBps: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
    minSpend: { type: Number, default: 0 },
    maxDiscount: { type: Number, default: 0 },
    budget: { type: Number, default: 0 },
    spent: { type: Number, default: 0 },
    maxRedemptions: { type: Number, default: 1_000_000 },
    redeemedCount: { type: Number, default: 0 },
    perUserLimit: { type: Number, default: 1 },
    firstTimeOnly: { type: Boolean, default: false },
    minTripDays: { type: Number, default: 0 },
    cities: { type: [String], default: [] },
    categories: { type: [String], default: [] },
    validFrom: { type: Date, default: () => new Date() },
    validTo: { type: Date, required: true },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, _id: false },
);

schema.index({ code: 1 }, { unique: true });
schema.index({ status: 1, validTo: 1 });

export const CouponModel = model<CouponDoc>('Coupon', schema);
