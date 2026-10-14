import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/**
 * An insurance partner: an insurer (or managing general agent) that offers its
 * own protection plans to CatoDrive guests.
 *
 * Self-serve like Host: the insurer applies from its own account and runs its
 * own portal. Admin only approves, suspends and, where negotiated, overrides
 * CatoDrive's commission. No insurer is named in code; anything provider
 * specific belongs in an adapter.
 */
export type InsurancePartnerStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface InsurancePartnerDoc {
  _id: string;
  /** The CatoDrive account the insurer signs in with. */
  userId: string;
  status: InsurancePartnerStatus;

  /** Registered company name, as on the licence. */
  legalName: string;
  /** What guests see at checkout. */
  displayName: string;
  /** Licence or NAIC number. */
  licenceNumber: string;
  /** Two-letter states the insurer is licensed in. Its plans can only be sold for cars in these states. */
  licensedStates: string[];
  contactName: string;
  email: string;
  phone?: string;
  website?: string;
  /** The licence certificate, uploaded to private storage. */
  licenceDoc?: { url: string; key?: string };

  /** Overrides the platform default when negotiated; unset means the default applies. */
  commissionBps?: number;

  /** Where payouts go. Only the last four digits of the account are kept. */
  payoutDetails?: { accountHolder?: string; bankName?: string; routingNumber?: string; accountLast4?: string };

  reviewNotes?: string;
  reviewedBy?: string;
  reviewedAt?: Date;
  approvedAt?: Date;
  suspendedAt?: Date;
  suspendedReason?: string;

  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<InsurancePartnerDoc>(
  {
    _id: { type: String, default: () => uuid() },
    userId: { type: String, required: true },
    status: { type: String, required: true, default: 'pending', enum: ['pending', 'approved', 'rejected', 'suspended'] },
    legalName: { type: String, required: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    licenceNumber: { type: String, required: true, trim: true },
    licensedStates: { type: [String], default: [] },
    contactName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: String,
    website: String,
    licenceDoc: { _id: false, url: String, key: String },
    commissionBps: Number,
    payoutDetails: { _id: false, accountHolder: String, bankName: String, routingNumber: String, accountLast4: String },
    reviewNotes: String,
    reviewedBy: String,
    reviewedAt: Date,
    approvedAt: Date,
    suspendedAt: Date,
    suspendedReason: String,
  },
  { timestamps: true, _id: false },
);

// One insurer per account.
schema.index({ userId: 1 }, { unique: true });
schema.index({ status: 1, createdAt: -1 });

export const InsurancePartnerModel = model<InsurancePartnerDoc>('InsurancePartner', schema);
