import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/**
 * A ledger of verification checks actually run against a guest — one row per
 * check, unlike KYC (one identity record per user). This is what makes a check
 * REUSABLE and RATE-LIMITED: before running an expensive MVR or background
 * check, the policy service looks here to answer "is there already a valid
 * result?" and "have we run too many within the configured window?".
 *
 * Frequency and validity are NOT encoded here — they live in admin config
 * (platform-config.verification), so CATO changes "MVR at most once per two
 * months" without a deploy. This ledger only records what happened and when.
 */
export type VerificationType = 'mvr' | 'identity' | 'background';
export type VerificationResult = 'pending' | 'passed' | 'failed' | 'error';

export interface VerificationCheckDoc {
  _id: string;
  userId: string;
  type: VerificationType;
  /** Which provider ran it (checkr, stripe_identity, …); null for a manual/stub. */
  provider?: string;
  result: VerificationResult;
  /** Provider's own reference (report id, session id) for reconciliation. */
  reference?: string;
  /** When the check was performed. Frequency is counted against this. */
  performedAt: Date;
  /** When a passing result stops being trusted (performedAt + validityDays).
   *  Absent for non-passing results. */
  validUntil?: Date;
  /** Optional provider risk score, for risk-based recheck later. */
  riskScore?: number;
  notes?: string;
  createdAt: Date;
}

const schema = new Schema<VerificationCheckDoc>(
  {
    _id: { type: String, default: () => uuid() },
    userId: { type: String, required: true },
    type: { type: String, required: true },
    provider: String,
    result: { type: String, required: true, default: 'pending' },
    reference: String,
    performedAt: { type: Date, required: true, default: () => new Date() },
    validUntil: Date,
    riskScore: Number,
    notes: String,
  },
  { timestamps: { createdAt: true, updatedAt: false }, _id: false },
);

// "How many MVRs has this guest had in the last N days" and "their latest valid
// result" are the two hot reads — both served by this index.
schema.index({ userId: 1, type: 1, performedAt: -1 });
schema.index({ userId: 1, type: 1, result: 1, validUntil: -1 });

export const VerificationCheckModel = model<VerificationCheckDoc>('VerificationCheck', schema);
