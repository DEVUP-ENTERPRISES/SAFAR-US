import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/** A payout CatoDrive sent to an insurance partner, recorded by staff against its payable account. */
export interface InsurerPayoutDoc {
  _id: string;
  insurerId: string;
  amount: number;
  currency: string;
  /** Bank transfer reference or check number. */
  reference: string;
  note?: string;
  paidAt: Date;
  recordedBy: string;
  ledgerTxnId: string;
  createdAt: Date;
}

const schema = new Schema<InsurerPayoutDoc>(
  {
    _id: { type: String, default: () => uuid() },
    insurerId: { type: String, required: true },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: 'USD' },
    reference: { type: String, required: true, trim: true },
    note: String,
    paidAt: { type: Date, required: true },
    recordedBy: { type: String, required: true },
    ledgerTxnId: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, _id: false },
);

schema.index({ insurerId: 1, paidAt: -1 });

export const InsurerPayoutModel = model<InsurerPayoutDoc>('InsurerPayout', schema);
