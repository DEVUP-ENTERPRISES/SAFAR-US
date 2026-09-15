import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/**
 * A submission from the public Contact page — and from the Investors page's
 * "Request the Full Deck", which routes through this same flow rather than a
 * bare mailto:, so every inbound lead (asset partner, investor, corporate,
 * general) is a durable, admin-visible record, not something that only ever
 * lives in an inbox. No login required.
 */
export type ContactInterest = 'asset_partner' | 'investor' | 'corporate' | 'general' | 'other';
export type ContactStatus = 'new' | 'responded';

export interface ContactInquiryDoc {
  _id: string;
  fullName: string;
  email: string;
  phone?: string;
  interest: ContactInterest;
  message: string;
  status: ContactStatus;

  submittedByUserId?: string;
  ip?: string;
  userAgent?: string;

  respondedBy?: string;
  respondedAt?: Date;
  adminNotes?: string;

  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ContactInquiryDoc>(
  {
    _id: { type: String, default: () => uuid() },
    fullName: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: String,
    interest: { type: String, required: true, enum: ['asset_partner', 'investor', 'corporate', 'general', 'other'] },
    message: { type: String, required: true },
    status: { type: String, default: 'new', enum: ['new', 'responded'] },

    submittedByUserId: String,
    ip: String,
    userAgent: String,

    respondedBy: String,
    respondedAt: Date,
    adminNotes: String,
  },
  { timestamps: true, _id: false },
);

schema.index({ status: 1, createdAt: -1 });
schema.index({ email: 1 });

export const ContactInquiryModel = model<ContactInquiryDoc>('ContactInquiry', schema);
