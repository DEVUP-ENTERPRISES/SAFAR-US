import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/** Every commercial term in force for a partner, written out in full so a later default change never reaches back. */
export interface ResolvedTermsSnapshot {
  managementFeeBps: number;
  insuranceMonthlyCents: number;
  detailingMonthlyCents: number;
  deductibleCapCents: number;
  maintenanceApprovalCents: number;
  payoutDayOfMonth: number;
}

export type TermsVersionStatus = 'pending_signature' | 'active' | 'cancelled' | 'declined';

/**
 * One version of a partner's terms. The baseline is written when they sign their agreement; every later
 * change is a new version that takes effect only once the partner signs the amendment. Statements use the
 * version in force on each trip's date, so past months never change.
 */
export interface AssetPartnerTermsVersionDoc {
  _id: string;
  partnerId: string;
  terms: ResolvedTermsSnapshot;
  /** From this moment the version applies (never earlier than when it was signed). */
  effectiveFrom: Date;
  /** The date staff asked for; effectiveFrom becomes the later of this and the signing time. */
  requestedFrom: Date;
  status: TermsVersionStatus;
  kind: 'baseline' | 'amendment';
  envelopeId?: string;
  reason?: string;
  createdBy: string;
  createdAt: Date;
  activatedAt?: Date;
  closedAt?: Date;
  closedBy?: string;
}

const terms = {
  managementFeeBps: { type: Number, required: true },
  insuranceMonthlyCents: { type: Number, required: true },
  detailingMonthlyCents: { type: Number, required: true },
  deductibleCapCents: { type: Number, required: true },
  maintenanceApprovalCents: { type: Number, required: true },
  payoutDayOfMonth: { type: Number, required: true },
};

const schema = new Schema<AssetPartnerTermsVersionDoc>(
  {
    _id: { type: String, default: () => uuid() },
    partnerId: { type: String, required: true },
    terms: { type: new Schema(terms, { _id: false }), required: true },
    effectiveFrom: { type: Date, required: true },
    requestedFrom: { type: Date, required: true },
    status: { type: String, enum: ['pending_signature', 'active', 'cancelled', 'declined'], required: true },
    kind: { type: String, enum: ['baseline', 'amendment'], required: true },
    envelopeId: String,
    reason: String,
    createdBy: { type: String, required: true },
    activatedAt: Date,
    closedAt: Date,
    closedBy: String,
  },
  { timestamps: { createdAt: true, updatedAt: false }, _id: false },
);
schema.index({ partnerId: 1, status: 1, effectiveFrom: -1 });
// At most one change waiting for a signature per partner.
schema.index({ partnerId: 1 }, { unique: true, partialFilterExpression: { status: 'pending_signature' }, name: 'one_pending_per_partner' });

export const AssetPartnerTermsVersionModel = model<AssetPartnerTermsVersionDoc>('AssetPartnerTermsVersion', schema);
