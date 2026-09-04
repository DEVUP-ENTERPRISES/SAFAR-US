import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export interface DocumentDoc {
  _id: string;
  ownerId: string;
  vehicleId?: string;
  category: 'registration' | 'insurance' | 'pollution' | 'fitness' | 'kyc' | 'claim';
  url: string;
  key?: string;
  expiresAt?: Date;
  /** Which expiry milestone (30 or 7 days) the host has already been warned
   *  about, so a daily sweep warns twice rather than thirty times. */
  expiryNoticeSentFor?: number;
  verification: { status: 'pending' | 'verified' | 'rejected'; reason?: string; verifiedAt?: Date };
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const schema = new Schema<DocumentDoc>(
  {
    _id: { type: String, default: () => uuid() },
    ownerId: { type: String, required: true },
    vehicleId: String,
    category: { type: String, required: true },
    url: { type: String, required: true },
    key: String,
    expiresAt: Date,
    expiryNoticeSentFor: Number,
    verification: {
      status: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
      reason: String,
      verifiedAt: Date,
    },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, _id: false },
);

schema.index({ vehicleId: 1, category: 1 });
schema.index({ ownerId: 1 });
schema.index({ 'verification.status': 1 });

export const DocumentModel = model<DocumentDoc>('Document', schema);
