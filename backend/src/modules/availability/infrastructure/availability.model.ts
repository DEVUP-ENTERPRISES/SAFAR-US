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
schema.index({ holdId: 1 });
schema.index({ bookingId: 1 });

export const AvailabilityModel = model<AvailabilityDoc>('Availability', schema);
