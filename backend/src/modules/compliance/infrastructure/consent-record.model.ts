import { Schema, model } from 'mongoose';

// One cookie-consent choice, kept as proof of what a visitor allowed and when; no IP or device details are stored.
export interface ConsentRecordDoc {
  _id: string;
  visitorId: string;
  userId?: string;
  analytics: boolean;
  marketing: boolean;
  gpc: boolean;
  version: number;
  source: 'banner' | 'settings' | 'gpc';
  createdAt: Date;
}

const schema = new Schema<ConsentRecordDoc>(
  {
    _id: { type: String, required: true },
    visitorId: { type: String, required: true },
    userId: String,
    analytics: { type: Boolean, required: true },
    marketing: { type: Boolean, required: true },
    gpc: { type: Boolean, required: true },
    version: { type: Number, required: true },
    source: { type: String, required: true, enum: ['banner', 'settings', 'gpc'] },
  },
  { timestamps: { createdAt: true, updatedAt: false }, _id: false },
);

schema.index({ visitorId: 1, createdAt: -1 });
schema.index({ userId: 1, createdAt: -1 }, { sparse: true });
// Kept three years, long enough to answer a regulator about an old choice.
schema.index({ createdAt: 1 }, { expireAfterSeconds: 3 * 365 * 86_400 });

export const ConsentRecordModel = model<ConsentRecordDoc>('ConsentRecord', schema, 'consent_records');
