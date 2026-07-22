import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/**
 * A device we have seen, and every account that has used it.
 *
 * The fingerprint is computed client-side and sent as a header; it is a hint,
 * not an identity — it can be spoofed, and two people on identical stock phones
 * can collide. It earns its keep by clustering: one device with nine accounts
 * is the single most reliable fraud-ring signal available without a vendor.
 */
export interface DeviceDoc {
  _id: string;
  fingerprint: string;
  userIds: string[];
  platform?: string;
  userAgent?: string;
  lastIp?: string;
  emulator: boolean;
  rooted: boolean;
  firstSeenAt: Date;
  lastSeenAt: Date;
  /** Set by an operator; every account on it is treated as blocked. */
  blocked: boolean;
  blockedReason?: string;
}

const deviceSchema = new Schema<DeviceDoc>(
  {
    _id: { type: String, default: () => uuid() },
    fingerprint: { type: String, required: true },
    userIds: { type: [String], default: [] },
    platform: String,
    userAgent: String,
    lastIp: String,
    emulator: { type: Boolean, default: false },
    rooted: { type: Boolean, default: false },
    firstSeenAt: { type: Date, default: () => new Date() },
    lastSeenAt: { type: Date, default: () => new Date() },
    blocked: { type: Boolean, default: false },
    blockedReason: String,
  },
  { versionKey: false, _id: false },
);
deviceSchema.index({ fingerprint: 1 }, { unique: true });
deviceSchema.index({ userIds: 1 });
deviceSchema.index({ blocked: 1 });

export const DeviceModel = model<DeviceDoc>('Device', deviceSchema);

/**
 * Every risk decision, kept forever.
 *
 * This is the evidence trail for a chargeback, a regulator, or an appeal — so
 * it stores the signals that fired and the score at that moment, not just the
 * outcome. A decision you cannot explain later is a decision you cannot defend.
 */
export interface RiskEventDoc {
  _id: string;
  userId: string;
  /** What was being attempted: signup, login, booking, payout, kyc. */
  context: string;
  score: number;
  band: 'low' | 'medium' | 'high' | 'block';
  signals: { signal: string; weight: number; detail?: string }[];
  deviceFingerprint?: string;
  ip?: string;
  /** What the platform did about it. */
  action: 'allow' | 'challenge' | 'review' | 'deny';
  /** Set when a human overrode the automated call. */
  overriddenBy?: string;
  overrideReason?: string;
  createdAt: Date;
}

const riskEventSchema = new Schema<RiskEventDoc>(
  {
    _id: { type: String, default: () => uuid() },
    userId: { type: String, required: true },
    context: { type: String, required: true },
    score: { type: Number, required: true },
    band: { type: String, required: true },
    signals: {
      type: [{ signal: String, weight: Number, detail: String }],
      default: [],
    },
    deviceFingerprint: String,
    ip: String,
    action: { type: String, required: true },
    overriddenBy: String,
    overrideReason: String,
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, _id: false },
);
riskEventSchema.index({ userId: 1, createdAt: -1 });
riskEventSchema.index({ band: 1, createdAt: -1 });
riskEventSchema.index({ action: 1, createdAt: -1 });

export const RiskEventModel = model<RiskEventDoc>('RiskEvent', riskEventSchema);

/**
 * Deny list. Entries are hashed, never stored in clear: a leaked deny list is
 * a list of real people's licence numbers and phone numbers.
 */
export interface DenyEntryDoc {
  _id: string;
  type: 'email' | 'phone' | 'licence' | 'device' | 'card';
  valueHash: string;
  reason: string;
  addedBy: string;
  createdAt: Date;
}

const denySchema = new Schema<DenyEntryDoc>(
  {
    _id: { type: String, default: () => uuid() },
    type: { type: String, required: true },
    valueHash: { type: String, required: true },
    reason: { type: String, required: true },
    addedBy: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, _id: false },
);
denySchema.index({ type: 1, valueHash: 1 }, { unique: true });

export const DenyEntryModel = model<DenyEntryDoc>('DenyEntry', denySchema);
