import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/**
 * CATO Plus — a paid membership for guests.
 *
 * Benefits are declarative so the pricing engine can apply them without knowing
 * plan names, and admin can invent a new tier without a deploy.
 */
export interface SubscriptionPlanDoc {
  _id: string;
  code: string; // 'plus' | 'pro' | …
  name: string;
  description: string;
  /** Monthly price in cents. 0 = free tier. */
  priceCents: number;
  benefits: {
    /** % off the rental base. 500 = 5% off. */
    bookingDiscountBps: number;
    /** Guest is never charged surge (price caps at 1.0x). */
    waiveSurge: boolean;
    /** This protection tier is included free (e.g. 'standard'). */
    freeProtectionCode?: string;
    /** Multiplier on reward points earned. 20000 = 2x points. */
    rewardsMultiplierBps: number;
  };
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const planSchema = new Schema<SubscriptionPlanDoc>(
  {
    _id: { type: String, default: () => uuid() },
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    priceCents: { type: Number, required: true, min: 0 },
    benefits: {
      bookingDiscountBps: { type: Number, default: 0 },
      waiveSurge: { type: Boolean, default: false },
      freeProtectionCode: String,
      rewardsMultiplierBps: { type: Number, default: 10000 },
    },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, _id: false },
);

export const SubscriptionPlanModel = model<SubscriptionPlanDoc>('SubscriptionPlan', planSchema);

/** A user's live membership. */
export interface UserSubscriptionDoc {
  _id: string;
  userId: string;
  planCode: string;
  status: 'active' | 'cancelled' | 'expired';
  /** Benefits are SNAPSHOT at purchase — changing a plan can't retro-change what someone bought. */
  benefitsSnapshot: SubscriptionPlanDoc['benefits'];
  pricePaidCents: number;
  startedAt: Date;
  renewsAt: Date;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const subSchema = new Schema<UserSubscriptionDoc>(
  {
    _id: { type: String, default: () => uuid() },
    userId: { type: String, required: true },
    planCode: { type: String, required: true },
    status: { type: String, default: 'active', enum: ['active', 'cancelled', 'expired'] },
    benefitsSnapshot: {
      bookingDiscountBps: Number,
      waiveSurge: Boolean,
      freeProtectionCode: String,
      rewardsMultiplierBps: Number,
    },
    pricePaidCents: { type: Number, required: true },
    startedAt: { type: Date, default: Date.now },
    renewsAt: { type: Date, required: true },
    cancelledAt: Date,
  },
  { timestamps: true, _id: false },
);

subSchema.index({ userId: 1, status: 1 });

export const UserSubscriptionModel = model<UserSubscriptionDoc>('UserSubscription', subSchema);
