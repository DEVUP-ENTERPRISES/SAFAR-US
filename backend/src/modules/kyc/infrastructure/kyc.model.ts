import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export type KycStatus = 'not_started' | 'pending' | 'approved' | 'rejected';

export interface KycDoc {
  _id: string;
  userId: string;
  level: 'basic' | 'full';
  status: KycStatus;
  documents: { type: 'license' | 'passport' | 'national_id' | 'selfie'; url: string }[];
  provider?: string;
  /** Read off the document. A licence that lapses mid-trip is not valid for
   *  that trip, so booking eligibility checks this against the trip end. */
  licenceExpiry?: Date;
  licenceNumberHash?: string;
  rejectionReason?: string;
  reviewedBy?: string;
  decisionAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<KycDoc>(
  {
    _id: { type: String, default: () => uuid() },
    userId: { type: String, required: true },
    level: { type: String, enum: ['basic', 'full'], default: 'full' },
    status: { type: String, default: 'pending' },
    documents: {
      type: [{ type: { type: String }, url: String }],
      default: [],
    },
    provider: String,
    licenceExpiry: Date,
    // Hashed, not stored in clear: it is only ever used to detect the same
    // licence being reused across accounts.
    licenceNumberHash: String,
    rejectionReason: String,
    reviewedBy: String,
    decisionAt: Date,
  },
  { timestamps: true, _id: false },
);

schema.index({ userId: 1 }, { unique: true });
schema.index({ status: 1 });

export const KycModel = model<KycDoc>('Kyc', schema);
