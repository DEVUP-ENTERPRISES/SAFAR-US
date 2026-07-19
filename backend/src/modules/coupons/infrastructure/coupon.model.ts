import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export interface CouponDoc {
  _id: string;
  code: string;
  type: 'percent' | 'fixed';
  valueBps: number; // for percent (e.g. 1000 = 10%)
  amount: number; // for fixed (minor units)
  currency: string;
  minSpend: number;
  maxRedemptions: number;
  redeemedCount: number;
  perUserLimit: number;
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
    type: { type: String, enum: ['percent', 'fixed'], required: true },
    valueBps: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
    minSpend: { type: Number, default: 0 },
    maxRedemptions: { type: Number, default: 1_000_000 },
    redeemedCount: { type: Number, default: 0 },
    perUserLimit: { type: Number, default: 1 },
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
