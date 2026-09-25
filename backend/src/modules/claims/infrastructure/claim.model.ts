import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export type ClaimType = 'damage' | 'insurance' | 'dispute';
export type ClaimStatus =
  | 'opened'
  | 'investigating'
  | 'disputed'
  | 'approved'
  | 'rejected'
  | 'settled'
  | 'closed';

export interface ClaimDoc {
  _id: string;
  type: ClaimType;
  bookingId?: string;
  tripId?: string;
  claimantId: string;
  /** The party the claim is against — the only one besides the claimant who may read or answer it. */
  respondentId?: string;
  hostId?: string;
  description: string;
  evidence: { url: string; kind: 'image' | 'file'; note?: string; addedBy?: string }[];
  amountClaimed?: number;
  amountApproved?: number;
  /** Cash actually taken from the guest (deposit + card); the rest was platform-funded. */
  collectedCents?: number;
  /** Who was found at fault, and what it cost them. */
  liableUserId?: string;
  penaltyCents?: number;
  warningIssued?: boolean;
  currency: string;
  status: ClaimStatus;
  assignedTo?: string;
  timeline: { status: ClaimStatus; at: Date; by: string; note?: string }[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const schema = new Schema<ClaimDoc>(
  {
    _id: { type: String, default: () => uuid() },
    type: { type: String, enum: ['damage', 'insurance', 'dispute'], required: true },
    bookingId: String,
    tripId: String,
    claimantId: { type: String, required: true },
    respondentId: String,
    hostId: String,
    description: { type: String, required: true },
    evidence: {
      type: [{ url: String, kind: { type: String, enum: ['image', 'file'] }, note: String, addedBy: String }],
      default: [],
    },
    amountClaimed: Number,
    amountApproved: Number,
    collectedCents: Number,
    liableUserId: String,
    penaltyCents: { type: Number, default: 0 },
    warningIssued: { type: Boolean, default: false },
    currency: { type: String, default: 'USD' },
    status: { type: String, default: 'opened' },
    assignedTo: String,
    timeline: {
      type: [{ status: String, at: Date, by: String, note: String }],
      default: [],
    },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, _id: false },
);

schema.index({ status: 1, assignedTo: 1 });
schema.index({ claimantId: 1, createdAt: -1 });
schema.index({ respondentId: 1, createdAt: -1 });
schema.index({ bookingId: 1 });

export const ClaimModel = model<ClaimDoc>('Claim', schema);
