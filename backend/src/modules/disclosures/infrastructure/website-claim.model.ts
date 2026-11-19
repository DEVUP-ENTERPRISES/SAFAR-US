import { Schema, model } from 'mongoose';
import { CLAIM_CATEGORIES, CLAIM_OWNERS, type ClaimCategory, type ClaimKind, type ClaimOwner } from '../domain/defaults';

export const CLAIM_STATUSES = ['draft', 'evidence', 'verified', 'legal_review', 'approved', 'suspended'] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export interface ClaimFigure { label: string; display: string; value?: number; asOf?: string; kind: ClaimKind }

export interface ClaimEvidence { _id: string; label: string; url?: string; note?: string; addedBy: string; addedAt: Date }

export interface ClaimEvent { at: Date; by: string; action: string; note?: string }

export interface WebsiteClaimDoc {
  _id: string;
  key: string;
  category: ClaimCategory;
  owner: ClaimOwner;
  responsibleUserId?: string;
  wording: string;
  definition: string;
  pages: string[];
  draft: ClaimFigure;
  live: ClaimFigure | null;
  status: ClaimStatus;
  evidence: ClaimEvidence[];
  verifiedBy?: string;
  verifiedAt?: Date;
  legalReviewedBy?: string;
  legalReviewedAt?: Date;
  legalNote?: string;
  approvedBy?: string;
  approvedAt?: Date;
  firstPublishedAt?: Date;
  lastReviewedAt?: Date;
  nextReviewAt?: Date;
  remindedAt?: Date;
  history: ClaimEvent[];
  createdAt: Date;
  updatedAt: Date;
}

const figure = new Schema<ClaimFigure>(
  { label: { type: String, required: true }, display: { type: String, required: true }, value: Number, asOf: String, kind: { type: String, required: true, enum: ['reported', 'forecast', 'example', 'text'] } },
  { _id: false },
);

const schema = new Schema<WebsiteClaimDoc>(
  {
    _id: { type: String, required: true },
    key: { type: String, required: true },
    category: { type: String, required: true, enum: CLAIM_CATEGORIES },
    owner: { type: String, required: true, enum: CLAIM_OWNERS },
    responsibleUserId: String,
    wording: { type: String, required: true },
    definition: { type: String, required: true },
    pages: { type: [String], default: [] },
    draft: { type: figure, required: true },
    live: { type: figure, default: null },
    status: { type: String, required: true, enum: CLAIM_STATUSES },
    evidence: {
      type: [new Schema<ClaimEvidence>({ _id: { type: String, required: true }, label: { type: String, required: true }, url: String, note: String, addedBy: { type: String, required: true }, addedAt: { type: Date, required: true } })],
      default: [],
    },
    verifiedBy: String,
    verifiedAt: Date,
    legalReviewedBy: String,
    legalReviewedAt: Date,
    legalNote: String,
    approvedBy: String,
    approvedAt: Date,
    firstPublishedAt: Date,
    lastReviewedAt: Date,
    nextReviewAt: Date,
    remindedAt: Date,
    history: { type: [new Schema<ClaimEvent>({ at: Date, by: String, action: String, note: String }, { _id: false })], default: [] },
  },
  { timestamps: true, _id: false },
);

schema.index({ key: 1 }, { unique: true });
schema.index({ status: 1, nextReviewAt: 1 });

export const WebsiteClaimModel = model<WebsiteClaimDoc>('WebsiteClaim', schema, 'website_claims');
