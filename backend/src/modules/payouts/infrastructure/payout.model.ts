import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export interface PayoutDoc {
  _id: string;
  hostId: string;
  bookingId?: string;
  amount: number;
  currency: string;
  status: 'scheduled' | 'paid' | 'failed';
  instant?: boolean;
  ledgerTxnId?: string;
  scheduledFor: Date;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<PayoutDoc>(
  {
    _id: { type: String, default: () => uuid() },
    hostId: { type: String, required: true },
    bookingId: String,
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    status: { type: String, default: 'scheduled', enum: ['scheduled', 'paid', 'failed'] },
    instant: { type: Boolean, default: false },
    ledgerTxnId: String,
    scheduledFor: { type: Date, required: true },
    paidAt: Date,
  },
  { timestamps: true, _id: false },
);

schema.index({ hostId: 1, status: 1 });
schema.index({ status: 1, scheduledFor: 1 });

export const PayoutModel = model<PayoutDoc>('Payout', schema);
