import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/**
 * A commission rule = "take THIS rate when the booking looks like THIS".
 *
 * Scopes, from least to most specific:
 *   global      → every booking (the fallback lives in PlatformConfig)
 *   category    → e.g. take 25% on `luxury`, 15% on `economy`
 *   hostTier    → e.g. reward Superhosts with a lower rate
 *   host        → a negotiated rate for one specific host (fleet deals)
 *
 * The most specific ACTIVE rule wins; ties break on `priority`, then newest.
 * Rules can be time-boxed (effectiveFrom/To) to run a promo without a deploy.
 */
export type CommissionScope = 'global' | 'category' | 'hostTier' | 'host';

export interface CommissionRuleDoc {
  _id: string;
  name: string;
  scope: CommissionScope;
  /** The value the scope matches on: category key, tier key, or hostId. Null for global. */
  scopeValue?: string;
  commissionBps: number;
  priority: number;
  active: boolean;
  effectiveFrom?: Date;
  effectiveTo?: Date;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Specificity ranking — a host rule always beats a category rule. */
export const SCOPE_SPECIFICITY: Record<CommissionScope, number> = {
  global: 0,
  category: 1,
  hostTier: 2,
  host: 3,
};

const schema = new Schema<CommissionRuleDoc>(
  {
    _id: { type: String, default: () => uuid() },
    name: { type: String, required: true },
    scope: { type: String, required: true, enum: ['global', 'category', 'hostTier', 'host'] },
    scopeValue: String,
    commissionBps: { type: Number, required: true, min: 0, max: 10000 },
    priority: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    effectiveFrom: Date,
    effectiveTo: Date,
    createdBy: String,
  },
  { timestamps: true, _id: false },
);

schema.index({ active: 1, scope: 1, scopeValue: 1 });

export const CommissionRuleModel = model<CommissionRuleDoc>('CommissionRule', schema);
