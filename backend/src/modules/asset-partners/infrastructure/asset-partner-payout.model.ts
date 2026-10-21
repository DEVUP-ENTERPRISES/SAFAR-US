import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/** Money CatoDrive actually sent a partner for one month's statement. */
export interface AssetPartnerPayoutDoc {
  _id: string;
  partnerId: string;
  /** 'YYYY-MM', the statement month it settles. */
  period: string;
  /** Minor units. */
  amount: number;
  currency: string;
  method: 'zelle' | 'check';
  reference: string;
  note?: string;
  paidAt: Date;
  recordedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<AssetPartnerPayoutDoc>(
  {
    _id: { type: String, default: () => uuid() },
    partnerId: { type: String, required: true },
    period: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    method: { type: String, required: true, enum: ['zelle', 'check'] },
    reference: { type: String, required: true },
    note: String,
    paidAt: { type: Date, required: true },
    recordedBy: { type: String, required: true },
  },
  { timestamps: true, _id: false },
);

// One payout per partner per month, so a double click can't pay twice.
schema.index({ partnerId: 1, period: 1 }, { unique: true });
schema.index({ period: 1 });

export const AssetPartnerPayoutModel = model<AssetPartnerPayoutDoc>('AssetPartnerPayout', schema);
