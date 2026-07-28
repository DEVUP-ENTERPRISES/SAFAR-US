import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/**
 * A search a guest asked to be told about. When a new car is listed that
 * matches the criteria, the owner is alerted — the "notify me about new
 * listings" pattern every mature marketplace has and this one lacked.
 *
 * Criteria are stored as they were entered; matching is done against a newly
 * listed vehicle, not by re-running the geo search (a saved search has no live
 * date range to check availability against).
 */
export interface SavedSearchDoc {
  _id: string;
  userId: string;
  /** Human label for the list, e.g. "SUVs in Austin under $90". */
  label: string;
  criteria: {
    city?: string;
    category?: string;
    fuelType?: 'petrol' | 'diesel' | 'hybrid' | 'ev';
    transmission?: 'manual' | 'automatic';
    seatsMin?: number;
    priceMaxCents?: number;
    instantBook?: boolean;
  };
  /** Muting alerts without deleting the search. */
  alertsEnabled: boolean;
  lastAlertedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<SavedSearchDoc>(
  {
    _id: { type: String, default: () => uuid() },
    userId: { type: String, required: true },
    label: { type: String, required: true },
    criteria: {
      city: String,
      category: String,
      fuelType: { type: String, enum: ['petrol', 'diesel', 'hybrid', 'ev'] },
      transmission: { type: String, enum: ['manual', 'automatic'] },
      seatsMin: Number,
      priceMaxCents: Number,
      instantBook: Boolean,
    },
    alertsEnabled: { type: Boolean, default: true },
    lastAlertedAt: Date,
  },
  { timestamps: true, versionKey: false, _id: false },
);
schema.index({ userId: 1, createdAt: -1 });
// Only searches with a city can be matched against a listing cheaply.
schema.index({ 'criteria.city': 1, alertsEnabled: 1 });

export const SavedSearchModel = model<SavedSearchDoc>('SavedSearch', schema);
