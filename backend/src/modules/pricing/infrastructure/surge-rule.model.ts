import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/**
 * A surge rule = "multiply the daily rate when demand looks like THIS".
 *
 * Unlike a ride-hailing surge (which is instantaneous), a car-rental surge is
 * *date-scoped*: prices spike for a holiday weekend, a conference, a city with
 * no cars left. So a rule can carry a date window AND a weekday/hour schedule,
 * and it is evaluated per calendar day of the trip — not once per booking.
 *
 * Specificity: city+category > city > category > global.
 */
export type SurgeScope = 'global' | 'city' | 'category' | 'cityCategory';

export interface SurgeRuleDoc {
  _id: string;
  name: string;
  scope: SurgeScope;
  /** For 'city' / 'category'. For 'cityCategory' use both fields below. */
  city?: string;
  category?: string;
  /** 10000 = 1.0x (no surge). 15000 = 1.5x. */
  multiplierBps: number;
  /** 0=Sun … 6=Sat. Empty = every day. */
  daysOfWeek: number[];
  effectiveFrom?: Date;
  effectiveTo?: Date;
  priority: number;
  active: boolean;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const SURGE_SPECIFICITY: Record<SurgeScope, number> = {
  global: 0,
  category: 1,
  city: 2,
  cityCategory: 3,
};

const schema = new Schema<SurgeRuleDoc>(
  {
    _id: { type: String, default: () => uuid() },
    name: { type: String, required: true },
    scope: { type: String, required: true, enum: ['global', 'city', 'category', 'cityCategory'] },
    city: String,
    category: String,
    multiplierBps: { type: Number, required: true, min: 10000 }, // never below 1.0x
    daysOfWeek: { type: [Number], default: [] },
    effectiveFrom: Date,
    effectiveTo: Date,
    priority: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    createdBy: String,
  },
  { timestamps: true, _id: false },
);

schema.index({ active: 1, scope: 1, city: 1, category: 1 });

export const SurgeRuleModel = model<SurgeRuleDoc>('SurgeRule', schema);
