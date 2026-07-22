import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/**
 * A legal hold suspends the right to erasure for one account.
 *
 * Placed when an investigation, insurance claim, chargeback or law-enforcement
 * request is open. Without it, "delete my data" becomes a way to destroy the
 * evidence of one's own conduct — which is precisely the abuse these statutes
 * carve an exception for.
 */
export interface LegalHoldDoc {
  _id: string;
  userId: string;
  reason: string;
  placedBy: string;
  placedAt: Date;
  releasedAt: Date | null;
  releasedBy?: string;
}

const schema = new Schema<LegalHoldDoc>(
  {
    _id: { type: String, default: () => uuid() },
    userId: { type: String, required: true },
    reason: { type: String, required: true },
    placedBy: { type: String, required: true },
    placedAt: { type: Date, default: () => new Date() },
    releasedAt: { type: Date, default: null },
    releasedBy: String,
  },
  { timestamps: true, versionKey: false, _id: false },
);

schema.index({ userId: 1, releasedAt: 1 });

export const LegalHoldModel = model<LegalHoldDoc>('LegalHold', schema);
