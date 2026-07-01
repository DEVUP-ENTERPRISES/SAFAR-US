import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export interface HostDoc {
  _id: string;
  userId: string;
  displayName: string;
  bio?: string;
  hostType: 'individual' | 'business';
  isFleetOwner: boolean;
  businessProfile?: {
    legalName?: string;
    registrationNumber?: string;
    address?: string;
    supportPhone?: string;
    supportEmail?: string;
  };
  taxInfo?: {
    taxId?: string; // GSTIN / EIN / PAN
    country?: string;
    businessTax?: boolean;
  };
  bankingDetails?: {
    accountHolder?: string;
    accountNumberMasked?: string; // never store full PAN/acct in clear in prod
    ifscOrRouting?: string;
    bankName?: string;
    stripeConnectedAccountId?: string;
    verified?: boolean;
  };
  verificationStatus: 'pending' | 'verified' | 'rejected';
  ratingAvg: number;
  ratingCount: number;
  totalTrips: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const schema = new Schema<HostDoc>(
  {
    _id: { type: String, default: () => uuid() },
    userId: { type: String, required: true },
    displayName: { type: String, required: true },
    bio: String,
    hostType: { type: String, enum: ['individual', 'business'], default: 'individual' },
    isFleetOwner: { type: Boolean, default: false },
    businessProfile: {
      legalName: String,
      registrationNumber: String,
      address: String,
      supportPhone: String,
      supportEmail: String,
    },
    taxInfo: {
      taxId: String,
      country: String,
      businessTax: Boolean,
    },
    bankingDetails: {
      accountHolder: String,
      accountNumberMasked: String,
      ifscOrRouting: String,
      bankName: String,
      stripeConnectedAccountId: String,
      verified: { type: Boolean, default: false },
    },
    verificationStatus: {
      type: String,
      default: 'pending',
      enum: ['pending', 'verified', 'rejected'],
    },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    totalTrips: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, _id: false },
);

schema.index({ userId: 1 }, { unique: true });
schema.index({ verificationStatus: 1 });

export const HostModel = model<HostDoc>('Host', schema);
