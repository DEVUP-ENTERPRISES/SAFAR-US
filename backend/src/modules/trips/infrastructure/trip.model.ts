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
  checkin?: { at: Date; method: 'contactless' | 'in_person' };
  /** Host confirmed the guest's driver's licence at handover. */
  licenseConfirmed?: boolean;
  licenseConfirmedAt?: Date;
  /** Condition photos. `phase` splits pre-trip (check-in) from post-trip (checkout). */
  photos: { url: string; key?: string; phase: 'pre' | 'post'; byUserId: string; at: Date }[];
  /** Charged to the guest for driving past the included mileage. */
  mileageOverage?: { km: number; amountCents: number; chargedAt: Date };
  handover: { at: Date; odometerStart?: number; fuelStart?: number; notes?: string };
  return?: { at: Date; odometerEnd?: number; fuelEnd?: number; notes?: string };
  liveLocation?: { type: 'Point'; coordinates: [number, number]; updatedAt: Date };
  damageReports: { description: string; photos: string[]; byUserId: string; at: Date }[];
  sosEvents: { byUserId: string; at: Date }[];
  /** Structured emergencies — accident, breakdown, medical, theft, unsafe party.
   *  An open incident pauses the trip: it cannot be completed (and billed) until
   *  it is resolved, so no late/mileage/fuel charge lands during an emergency. */
  incidents: { type: string; status: 'open' | 'resolved'; note?: string; byUserId: string; at: Date; resolvedAt?: Date }[];
  pausedForIncident?: boolean;
  /** Which exception kind the guest has already been told about, so notice is
   *  sent once per episode rather than on every read. */
  trackingNoticeSentFor?: 'sos' | 'overdue' | 'incident';
  /** The host verified the guest's pickup code at handover (physical presence). */
  pickupVerified?: boolean;
  pickupVerifiedAt?: Date;
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
    checkin: {
      at: Date,
      method: { type: String, enum: ['contactless', 'in_person'] },
    },
    licenseConfirmed: { type: Boolean, default: false },
    licenseConfirmedAt: Date,
    photos: {
      type: [{ _id: false, url: String, key: String, phase: { type: String, enum: ['pre', 'post'] }, byUserId: String, at: Date }],
      default: [],
    },
    mileageOverage: { km: Number, amountCents: Number, chargedAt: Date },
    handover: {
      at: Date,
      odometerStart: Number,
      fuelStart: Number,
      notes: String,
    },
    damageReports: {
      type: [{ description: String, photos: [String], byUserId: String, at: Date }],
      default: [],
    },
    sosEvents: {
      type: [{ byUserId: String, at: Date }],
      default: [],
    },
    incidents: {
      // `type: { type: String }` — the field is named "type" (Mongoose keyword).
      type: [{ _id: false, type: { type: String }, status: String, note: String, byUserId: String, at: Date, resolvedAt: Date }],
      default: [],
    },
    pausedForIncident: { type: Boolean, default: false },
    trackingNoticeSentFor: { type: String, enum: ['sos', 'overdue', 'incident'] },
    pickupVerified: { type: Boolean, default: false },
    pickupVerifiedAt: Date,
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
