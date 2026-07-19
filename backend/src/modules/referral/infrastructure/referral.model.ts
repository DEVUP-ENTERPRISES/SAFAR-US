import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/** A user's personal referral code. */
export interface ReferralCodeDoc {
  _id: string;
  userId: string;
  code: string;
  createdAt: Date;
  updatedAt: Date;
}
const codeSchema = new Schema<ReferralCodeDoc>(
  {
    _id: { type: String, default: () => uuid() },
    userId: { type: String, required: true },
    code: { type: String, required: true, uppercase: true },
  },
  { timestamps: true, _id: false },
);
codeSchema.index({ userId: 1 }, { unique: true });
codeSchema.index({ code: 1 }, { unique: true });
export const ReferralCodeModel = model<ReferralCodeDoc>('ReferralCode', codeSchema);

/** A referral relationship: referee joined via referrer's code. */
export interface ConversionDoc {
  _id: string;
  code: string;
  referrerId: string;
  refereeId: string;
  status: 'pending' | 'converted';
  convertedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
const convSchema = new Schema<ConversionDoc>(
  {
    _id: { type: String, default: () => uuid() },
    code: { type: String, required: true },
    referrerId: { type: String, required: true },
    refereeId: { type: String, required: true },
    status: { type: String, enum: ['pending', 'converted'], default: 'pending' },
    convertedAt: Date,
  },
  { timestamps: true, _id: false },
);
convSchema.index({ refereeId: 1 }, { unique: true }); // one referrer per referee
convSchema.index({ referrerId: 1, status: 1 });
export const ConversionModel = model<ConversionDoc>('ReferralConversion', convSchema);
