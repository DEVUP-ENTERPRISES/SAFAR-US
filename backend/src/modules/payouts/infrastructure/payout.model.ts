import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export interface PayoutDoc {
  _id: string;
  hostId: string;
  bookingId?: string;
  amount: number;
  currency: string;
  status: 'scheduled' | 'processing' | 'held' | 'paid' | 'failed';
  instant?: boolean;
  /** Set while a run owns the row, so two runs can never pay the same payout. */
  claimToken?: string;
  /** 'extra' = money collected after the main trip payout was scheduled (overage, a late fee, a kept cancellation share). */
  kind?: 'trip' | 'extra';
  /** Idempotency tag for extra payouts, so a replayed event cannot pay twice. */
  tag?: string;
  ledgerTxnId?: string;
  /** The processor's transfer id — proof the money actually left. */
  providerRef?: string;
  /** Why the last attempt failed, so a stuck payout can be explained. */
  lastError?: string;
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
    status: { type: String, default: 'scheduled', enum: ['scheduled', 'processing', 'held', 'paid', 'failed'] },
    claimToken: String,
    instant: { type: Boolean, default: false },
    kind: { type: String, enum: ['trip', 'extra'], default: 'trip' },
    tag: { type: String, sparse: true, unique: true },
    ledgerTxnId: String,
    providerRef: String,
    lastError: String,
    scheduledFor: { type: Date, required: true },
    paidAt: Date,
  },
  { timestamps: true, _id: false },
);

schema.index({ hostId: 1, status: 1 });
schema.index({ status: 1, scheduledFor: 1 });

export const PayoutModel = model<PayoutDoc>('Payout', schema);
