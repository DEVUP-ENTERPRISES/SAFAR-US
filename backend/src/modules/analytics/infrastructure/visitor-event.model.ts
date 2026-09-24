import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export type TrafficSource = 'direct' | 'search' | 'social' | 'referral' | 'email' | 'paid';

/**
 * One pageview. Append-only, high-volume, low-value-per-row — a 90-day TTL
 * index keeps the collection bounded instead of growing forever.
 *
 * No raw IP is ever stored: it is resolved to a country/city/point and a
 * salted, non-reversible hash in the same request, then discarded. The hash
 * exists only to count unique visitors — it cannot be turned back into an IP.
 */
export interface VisitorEventDoc {
  _id: string;
  sessionId: string;
  visitorHash: string;
  userId?: string; // set when the visitor is a logged-in user
  path: string;
  referrer?: string;
  referrerDomain?: string;
  source: TrafficSource;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  lat?: number;
  lng?: number;
  device: 'mobile' | 'tablet' | 'desktop';
  createdAt: Date;
}

const schema = new Schema<VisitorEventDoc>(
  {
    _id: { type: String, default: () => uuid() },
    sessionId: { type: String, required: true },
    visitorHash: { type: String, required: true },
    userId: String,
    path: { type: String, required: true },
    referrer: String,
    referrerDomain: String,
    source: { type: String, enum: ['direct', 'search', 'social', 'referral', 'email', 'paid'], required: true },
    utmSource: String,
    utmMedium: String,
    utmCampaign: String,
    country: String,
    countryCode: String,
    region: String,
    city: String,
    lat: Number,
    lng: Number,
    device: { type: String, enum: ['mobile', 'tablet', 'desktop'], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, _id: false },
);

schema.index({ createdAt: -1 });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86_400 });
schema.index({ sessionId: 1, createdAt: -1 });
schema.index({ countryCode: 1 });
schema.index({ referrerDomain: 1 });

export const VisitorEventModel = model<VisitorEventDoc>('VisitorEvent', schema);
