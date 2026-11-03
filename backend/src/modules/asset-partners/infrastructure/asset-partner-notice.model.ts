import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export const NOTICE_TYPES = ['toll', 'parking', 'traffic', 'impound', 'other'] as const;
export type NoticeType = (typeof NOTICE_TYPES)[number];

/**
 * matched: filed against the trip that had the car, so the guest can be charged.
 * needs_review: no trip, several trips, or arrived too late to charge; ops decides.
 * absorbed: CatoDrive pays it (the car was with our team, or the guest can't be charged).
 * rejected: not ours to pay (another car, a duplicate, before the car joined).
 */
export type NoticeStatus = 'matched' | 'needs_review' | 'absorbed' | 'rejected';
export type NoticeReviewReason = 'no_trip' | 'several_trips' | 'too_late';

/** A toll, parking or traffic notice an Asset Partner received for their car, often weeks after the trip. */
export interface AssetPartnerNoticeDoc {
  _id: string;
  partnerId: string;
  uploadedBy: string;
  vehicleId: string;
  type: NoticeType;
  issuedBy: string;
  noticeRef: string;
  /** Local date the offence happened, YYYY-MM-DD in the car's time zone. */
  occurredDate: string;
  /** Exact moment, when the notice prints a time. */
  occurredAt?: Date;
  amountCents: number;
  dueDate?: string;
  /** The partner already paid the agency; CatoDrive pays them back on their statement. */
  paidByPartner: boolean;
  evidence: { url: string; key?: string; kind: 'image' | 'file' }[];
  status: NoticeStatus;
  reviewReason?: NoticeReviewReason;
  bookingId?: string;
  candidateBookingIds: string[];
  violationId?: string;
  /** Statement month the partner is paid back in, once CatoDrive accepts the notice. */
  reimburseInPeriod?: string;
  /** CatoDrive paid the agency itself, when the partner hadn't. */
  agencyPaid?: { at: Date; by: string; reference?: string };
  resolution?: { by: string; at: Date; note?: string };
  timeline: { at: Date; by: string; event: string; note?: string }[];
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<AssetPartnerNoticeDoc>(
  {
    _id: { type: String, default: () => uuid() },
    partnerId: { type: String, required: true },
    uploadedBy: { type: String, required: true },
    vehicleId: { type: String, required: true },
    type: { type: String, enum: NOTICE_TYPES, required: true },
    issuedBy: { type: String, required: true, trim: true },
    noticeRef: { type: String, required: true, trim: true },
    occurredDate: { type: String, required: true },
    occurredAt: Date,
    amountCents: { type: Number, required: true },
    dueDate: String,
    paidByPartner: { type: Boolean, default: false },
    evidence: { type: [new Schema({ url: String, key: String, kind: { type: String, enum: ['image', 'file'] } }, { _id: false })], default: [] },
    status: { type: String, enum: ['matched', 'needs_review', 'absorbed', 'rejected'], required: true },
    reviewReason: { type: String, enum: ['no_trip', 'several_trips', 'too_late'] },
    bookingId: String,
    candidateBookingIds: { type: [String], default: [] },
    violationId: String,
    reimburseInPeriod: String,
    agencyPaid: { at: Date, by: String, reference: String },
    resolution: { by: String, at: Date, note: String },
    timeline: { type: [new Schema({ at: Date, by: String, event: String, note: String }, { _id: false })], default: [] },
  },
  { timestamps: true },
);

// One upload per notice per car; a second photo of the same letter is a duplicate, not a second charge.
schema.index({ vehicleId: 1, noticeRef: 1 }, { unique: true });
schema.index({ partnerId: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });
schema.index({ partnerId: 1, reimburseInPeriod: 1 });

export const AssetPartnerNoticeModel = model<AssetPartnerNoticeDoc>('AssetPartnerNotice', schema);
