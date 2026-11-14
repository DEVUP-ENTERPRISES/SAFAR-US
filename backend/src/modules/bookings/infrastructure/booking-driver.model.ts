import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export const DRIVER_STATUSES = ['invited', 'verifying', 'payment_failed', 'approved', 'declined', 'removed', 'expired'] as const;
export type DriverStatus = (typeof DRIVER_STATUSES)[number];

export interface BookingDriverDoc {
  _id: string;
  bookingId: string;
  /** The main guest, who invited the driver and pays the fee. */
  guestId: string;
  name: string;
  email: string;
  phone?: string;
  status: DriverStatus;
  /** True while the driver counts towards the trip's limit; one live invite per email per trip. */
  active: boolean;
  /** The driver's own CatoDrive account, set when they accept the invite. */
  userId?: string;
  /** SHA-256 of the invite link token; the token itself is only ever in the email. */
  tokenHash: string;
  tokenExpiresAt: Date;
  feeCents: number;
  currency: string;
  chargedAt?: Date;
  refundedAt?: Date;
  /** Why the check failed, in plain words for the guest and the driver. */
  declineReasons?: string[];
  /** Failed checks so far; the driver gets one retry. */
  attempts: number;
  acceptedAt?: Date;
  approvedAt?: Date;
  removedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<BookingDriverDoc>(
  {
    _id: { type: String, default: () => uuid() },
    bookingId: { type: String, required: true },
    guestId: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: String,
    status: { type: String, required: true, enum: DRIVER_STATUSES },
    active: { type: Boolean, required: true },
    userId: String,
    tokenHash: { type: String, required: true },
    tokenExpiresAt: { type: Date, required: true },
    feeCents: { type: Number, required: true },
    currency: { type: String, required: true },
    chargedAt: Date,
    refundedAt: Date,
    declineReasons: { type: [String], default: undefined },
    attempts: { type: Number, default: 0 },
    acceptedAt: Date,
    approvedAt: Date,
    removedAt: Date,
  },
  { timestamps: true, _id: false },
);

schema.index({ bookingId: 1, createdAt: 1 });
schema.index({ tokenHash: 1 }, { unique: true });
schema.index({ bookingId: 1, email: 1 }, { unique: true, partialFilterExpression: { active: true } });
schema.index({ userId: 1, status: 1 });
schema.index({ status: 1, tokenExpiresAt: 1 });

export const BookingDriverModel = model<BookingDriverDoc>('BookingDriver', schema, 'booking_drivers');
