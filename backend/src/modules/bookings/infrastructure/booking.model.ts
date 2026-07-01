import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';
import type { BookingStatus } from '../domain/booking-status';

interface MoneyField {
  amount: number;
  currency: string;
}

export interface BookingDoc {
  _id: string;
  code: string;
  guestId: string;
  hostId: string;
  vehicleId: string;
  period: { start: Date; end: Date };
  priceBreakdown: {
    days: number;
    base: MoneyField;
    cleaningFee: MoneyField;
    discount: MoneyField;
    subtotal: MoneyField;
    commission: MoneyField;
    tax: MoneyField;
    hostEarnings: MoneyField;
    total: MoneyField;
    currency: string;
  };
  cancellationPolicy: 'flexible' | 'moderate' | 'strict';
  status: BookingStatus;
  statusHistory: { from: BookingStatus | null; to: BookingStatus; at: Date; by: string; reason?: string }[];
  holdId?: string;
  paymentId?: string;
  couponCode?: string;
  instantBook: boolean;
  approvalDeadline?: Date;
  cancellation?: { by: string; at: Date; reason: string; refund: MoneyField };
  tripId?: string;
  idempotencyKey?: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const moneySchema = { amount: Number, currency: String };

const schema = new Schema<BookingDoc>(
  {
    _id: { type: String, default: () => uuid() },
    code: { type: String, required: true },
    guestId: { type: String, required: true },
    hostId: { type: String, required: true },
    vehicleId: { type: String, required: true },
    period: {
      start: { type: Date, required: true },
      end: { type: Date, required: true },
    },
    priceBreakdown: {
      days: Number,
      base: moneySchema,
      cleaningFee: moneySchema,
      discount: moneySchema,
      subtotal: moneySchema,
      commission: moneySchema,
      tax: moneySchema,
      hostEarnings: moneySchema,
      total: moneySchema,
      currency: String,
    },
    cancellationPolicy: { type: String, default: 'moderate' },
    status: { type: String, required: true },
    statusHistory: [
      {
        from: { type: String, default: null },
        to: String,
        at: Date,
        by: String,
        reason: String,
      },
    ],
    holdId: String,
    paymentId: String,
    couponCode: String,
    instantBook: { type: Boolean, default: false },
    approvalDeadline: Date,
    cancellation: {
      by: String,
      at: Date,
      reason: String,
      refund: moneySchema,
    },
    tripId: String,
    idempotencyKey: String,
    version: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, _id: false },
);

schema.index({ code: 1 }, { unique: true });
schema.index({ guestId: 1, createdAt: -1 });
schema.index({ hostId: 1, status: 1, createdAt: -1 });
schema.index({ vehicleId: 1, 'period.start': 1, 'period.end': 1 });
schema.index({ status: 1, approvalDeadline: 1 });
schema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

export const BookingModel = model<BookingDoc>('Booking', schema);
