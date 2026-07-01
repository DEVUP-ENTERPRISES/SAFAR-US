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
