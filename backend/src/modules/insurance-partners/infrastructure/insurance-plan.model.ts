import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/**
 * A protection plan an insurance partner sells at checkout. The insurer owns
 * it: price, deductible, limits, what it covers, and where it applies.
 */
export interface InsurancePlanDoc {
  _id: string;
  insurerId: string;
  name: string;
  description: string;
  /** Per trip day, in cents. */
  pricePerDay: number;
  /** What the guest pays toward a covered claim, in cents. */
  deductibleCents: number;
  /** Third-party liability limit, in cents. 0 = not stated. */
  liabilityLimitCents: number;
  /** Plain-language lines shown to the guest. */
  coverage: string[];
  /** Two-letter states. Empty = every state the insurer is licensed in. */
  states: string[];
  /** Car categories. Empty = every category. */
  categories: string[];
  /** Offered at checkout. */
  active: boolean;
  /** Lower first. */
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<InsurancePlanDoc>(
  {
    _id: { type: String, default: () => uuid() },
    insurerId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    pricePerDay: { type: Number, required: true, min: 0 },
    deductibleCents: { type: Number, default: 0, min: 0 },
    liabilityLimitCents: { type: Number, default: 0, min: 0 },
    coverage: { type: [String], default: [] },
    states: { type: [String], default: [] },
    categories: { type: [String], default: [] },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, _id: false },
);

schema.index({ insurerId: 1, sortOrder: 1 });
schema.index({ active: 1 });

export const InsurancePlanModel = model<InsurancePlanDoc>('InsurancePlan', schema);
