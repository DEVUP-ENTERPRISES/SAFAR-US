import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export type PaymentStatus =
  | 'requires_action'
  | 'authorized'
  | 'succeeded'
  | 'refunded'
  | 'partially_refunded'
  | 'cancelled'
  | 'failed';

export interface PaymentDoc {
  _id: string;
  bookingId?: string;
  userId: string;
  hostId?: string;
  type: 'booking' | 'topup' | 'deposit';
  intentId: string;
  amount: number;
  currency: string;
  hostEarnings: number;
  commission: number;
  tax: number;
  capturedAmount: number;
  refundedAmount: number;
  status: PaymentStatus;
  ledgerTxnId?: string;
  /** Why a deposit was released or captured, and when — dispute evidence. */
  releasedReason?: string;
  releasedAt?: Date;
  idempotencyKey?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const schema = new Schema<PaymentDoc>(
  {
    _id: { type: String, default: () => uuid() },
    bookingId: { type: String },
    userId: { type: String, required: true },
    hostId: { type: String },
    type: { type: String, required: true, enum: ['booking', 'topup', 'deposit'] },
    intentId: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    hostEarnings: { type: Number, default: 0 },
    commission: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    capturedAmount: { type: Number, default: 0 },
    refundedAmount: { type: Number, default: 0 },
    status: { type: String, required: true },
    ledgerTxnId: String,
    releasedReason: String,
    releasedAt: Date,
    idempotencyKey: String,
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, _id: false },
);

schema.index({ intentId: 1 }, { unique: true });
schema.index({ bookingId: 1 });
schema.index({ userId: 1, createdAt: -1 });
schema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

export const PaymentModel = model<PaymentDoc>('Payment', schema);
