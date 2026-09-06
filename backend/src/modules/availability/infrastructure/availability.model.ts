import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/**
 * One document per occupied day per vehicle. A day with NO document is
 * available. The unique (vehicleId, dayKey) index is the ultimate
 * double-booking backstop: two concurrent holds on the same day cannot
 * both insert.
 */
export interface AvailabilityDoc {
  _id: string;
  vehicleId: string;
  dayKey: string; // 'YYYY-MM-DD' (UTC)
  state: 'blocked' | 'held' | 'booked';
  holdId?: string;
  bookingId?: string;
  holdExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<AvailabilityDoc>(
  {
    _id: { type: String, default: () => uuid() },
    vehicleId: { type: String, required: true },
    dayKey: { type: String, required: true },
    state: { type: String, required: true, enum: ['blocked', 'held', 'booked'] },
    holdId: String,
    bookingId: String,
    holdExpiresAt: Date,
  },
  { timestamps: true, _id: false },
);

schema.index({ vehicleId: 1, dayKey: 1 }, { unique: true });
schema.index({ state: 1, holdExpiresAt: 1 });

/*
 * Garbage-collect abandoned holds.
 *
 * A 'held' row is a checkout in progress. Most convert to 'booked' (which
 * unsets holdExpiresAt) or are released, but a crash between placing the hold
 * and creating the booking can orphan one. Orphans never cause a double-booking
 * — isAvailable already treats an expired hold as free — but without cleanup the
 * collection grows without bound.
 *
 * A PARTIAL TTL, scoped to state:'held', deletes them at their own expiry and
 * can never touch a real booking: 'booked' rows are excluded by the filter, and
 * they have no holdExpiresAt to expire on anyway.
 */
schema.index(
  { holdExpiresAt: 1 },
  { expireAfterSeconds: 0, partialFilterExpression: { state: 'held' } },
);
schema.index({ holdId: 1 });
schema.index({ bookingId: 1 });

export const AvailabilityModel = model<AvailabilityDoc>('Availability', schema);
