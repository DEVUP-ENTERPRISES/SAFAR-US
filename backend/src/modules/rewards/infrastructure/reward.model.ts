import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/**
 * Append-only CATO Points ledger. Points are signed (earn > 0, redeem < 0).
 * Balance and lifetime are DERIVED by summing — never a mutable counter.
 */
export interface RewardEntryDoc {
  _id: string;
  userId: string;
  points: number;
  type: 'earn' | 'redeem' | 'bonus' | 'referral' | 'tier_bonus' | 'adjustment';
  refType: string;
  refId: string;
  description: string;
  createdAt: Date;
}

const schema = new Schema<RewardEntryDoc>(
  {
    _id: { type: String, default: () => uuid() },
    userId: { type: String, required: true },
    points: { type: Number, required: true },
    type: { type: String, required: true },
    refType: { type: String, default: '' },
    refId: { type: String, default: '' },
    description: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false }, _id: false },
);
schema.index({ userId: 1, createdAt: -1 });

export const RewardEntryModel = model<RewardEntryDoc>('RewardEntry', schema);
