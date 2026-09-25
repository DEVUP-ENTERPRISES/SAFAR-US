import { Schema, model } from 'mongoose';

export interface SessionDoc {
  /** The session id carried in the access token's `sid` claim. */
  _id: string;
  userId: string;
  refreshJti: string;
  /** The token id this one replaced, honoured briefly so a lost refresh response can be retried. */
  prevRefreshJti?: string;
  rotatedAt?: Date;
  userAgent?: string;
  ip?: string;
  createdAt: Date;
  /** Sliding: pushed forward on every refresh; MongoDB removes the row once it passes. */
  expiresAt: Date;
}

const schema = new Schema<SessionDoc>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    refreshJti: { type: String, required: true },
    prevRefreshJti: String,
    rotatedAt: Date,
    userAgent: String,
    ip: String,
    createdAt: { type: Date, default: () => new Date() },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false, _id: false },
);

schema.index({ userId: 1, createdAt: -1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SessionModel = model<SessionDoc>('Session', schema);
