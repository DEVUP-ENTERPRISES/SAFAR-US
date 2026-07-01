import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export type TripStatus = 'active' | 'completed' | 'disputed';

export interface TripDoc {
  _id: string;
  bookingId: string;
  vehicleId: string;
  guestId: string;
  hostId: string;
  status: TripStatus;
  handover: { at: Date; odometerStart?: number; fuelStart?: number; notes?: string };
  return?: { at: Date; odometerEnd?: number; fuelEnd?: number; notes?: string };
  liveLocation?: { type: 'Point'; coordinates: [number, number]; updatedAt: Date };
  distanceKm: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<TripDoc>(
  {
    _id: { type: String, default: () => uuid() },
    bookingId: { type: String, required: true },
    vehicleId: { type: String, required: true },
    guestId: { type: String, required: true },
    hostId: { type: String, required: true },
    status: { type: String, default: 'active', enum: ['active', 'completed', 'disputed'] },
    handover: {
      at: Date,
      odometerStart: Number,
      fuelStart: Number,
      notes: String,
    },
    return: {
      at: Date,
      odometerEnd: Number,
      fuelEnd: Number,
      notes: String,
    },
    liveLocation: {
      type: { type: String, enum: ['Point'] },
      coordinates: [Number],
      updatedAt: Date,
    },
    distanceKm: { type: Number, default: 0 },
  },
  { timestamps: true, _id: false },
);

schema.index({ bookingId: 1 }, { unique: true });
schema.index({ guestId: 1, status: 1 });
schema.index({ hostId: 1, status: 1 });
schema.index({ liveLocation: '2dsphere' });

export const TripModel = model<TripDoc>('Trip', schema);
