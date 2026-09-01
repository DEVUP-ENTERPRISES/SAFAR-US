import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/**
 * A citation incurred by a guest that reached the host weeks later.
 *
 * Tolls, parking and moving violations arrive by post long after the trip
 * closed, the deposit released and the card authorisation lapsed. Handled as an
 * ordinary post-trip incidental they would either be impossible to charge or,
 * worse, chargeable forever with no evidence — so they are their own record
 * with their own window, their own proof requirement, and a dispute the guest
 * can actually raise.
 */
export type ViolationType = 'toll' | 'parking' | 'traffic' | 'impound' | 'other';
export type ViolationStatus = 'reported' | 'charged' | 'disputed' | 'waived' | 'resolved';

export interface ViolationDoc {
  _id: string;
  bookingId: string;
  guestId: string;
  hostId: string;
  type: ViolationType;
  /** The citation/toll reference printed on the notice — the guest's proof it is real. */
  citationRef: string;
  /** Issuing body: a municipality, a tolling authority, a police department. */
  issuedBy: string;
  /** When the offence happened. Must fall inside the trip. */
  occurredAt: Date;
  /** Face value of the citation, minor units. */
  amount: number;
  /** What the platform charges for handling it, minor units. */
  adminFee: number;
  currency: string;
  /** A photo or PDF of the notice. Without it there is nothing to answer. */
  evidence: { url: string; kind: 'image' | 'file'; note?: string }[];
  status: ViolationStatus;
  reportedBy: string;
  /** The guest's side, if they dispute it. */
  disputeReason?: string;
  disputedAt?: Date;
  resolution?: string;
  resolvedBy?: string;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const schema = new Schema<ViolationDoc>(
  {
    _id: { type: String, default: () => uuid() },
    bookingId: { type: String, required: true },
    guestId: { type: String, required: true },
    hostId: { type: String, required: true },
    type: { type: String, enum: ['toll', 'parking', 'traffic', 'impound', 'other'], required: true },
    citationRef: { type: String, required: true, trim: true },
    issuedBy: { type: String, required: true, trim: true },
    occurredAt: { type: Date, required: true },
    amount: { type: Number, required: true },
    adminFee: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
    evidence: {
      type: [{ url: String, kind: { type: String, enum: ['image', 'file'] }, note: String }],
      default: [],
    },
    status: { type: String, enum: ['reported', 'charged', 'disputed', 'waived', 'resolved'], default: 'reported' },
    reportedBy: { type: String, required: true },
    disputeReason: String,
    disputedAt: Date,
    resolution: String,
    resolvedBy: String,
    resolvedAt: Date,
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, _id: false },
);

// The same citation must not be chargeable twice.
schema.index({ bookingId: 1, citationRef: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
schema.index({ guestId: 1, status: 1 });
schema.index({ status: 1, createdAt: -1 });

export const ViolationModel = model<ViolationDoc>('Violation', schema);
