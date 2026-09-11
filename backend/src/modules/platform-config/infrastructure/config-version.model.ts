import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/**
 * Append-only history of every published platform-economics configuration.
 *
 * The live config is a single mutable document (fast to read, Redis-cached).
 * That is right for serving prices, but on its own it cannot answer "what did
 * the fees look like last Tuesday", it cannot be rolled back, and a future
 * change cannot be staged. This model is the ledger that fixes all three:
 *
 *   - every publish writes a full immutable snapshot with a monotonic version;
 *   - a rollback is just re-publishing an older snapshot as a NEW version, so
 *     history is never rewritten;
 *   - a change can be staged with a future `effectiveFrom` (status 'scheduled')
 *     and promoted to 'published' by the scheduler when it comes due.
 *
 * A booking stamps the version it priced against, so an old booking can always
 * be reconstructed against the exact economics that produced it — even after
 * the live config has moved on many times.
 */
export type ConfigVersionStatus = 'published' | 'scheduled' | 'superseded' | 'rolled_back';

export interface ConfigVersionDoc {
  _id: string;
  /** Monotonic, gap-free version number. 1 is the first published config. */
  version: number;
  status: ConfigVersionStatus;
  /**
   * For a published/superseded version: the FULL config as it was live.
   * For a scheduled version: the PATCH to apply when it comes due (the full
   * snapshot is taken at promotion time, not now).
   */
  snapshot: Record<string, unknown>;
  /** True when `snapshot` is a partial patch awaiting promotion, not a full config. */
  isPatch: boolean;
  actorId: string;
  reason?: string;
  /** Which top-level sections changed vs the previous version. */
  changedKeys: string[];
  /** When this version takes / took effect. Future = staged. */
  effectiveFrom: Date;
  publishedAt?: Date;
  /** For a rollback, the version it restored. */
  restoredFromVersion?: number;
  createdAt: Date;
}

const schema = new Schema<ConfigVersionDoc>(
  {
    _id: { type: String, default: () => uuid() },
    version: { type: Number, required: true },
    status: { type: String, required: true, default: 'published' },
    snapshot: { type: Schema.Types.Mixed, required: true },
    isPatch: { type: Boolean, default: false },
    actorId: { type: String, required: true },
    reason: String,
    changedKeys: { type: [String], default: [] },
    effectiveFrom: { type: Date, required: true, default: () => new Date() },
    publishedAt: Date,
    restoredFromVersion: Number,
  },
  { timestamps: { createdAt: true, updatedAt: false }, _id: false },
);

// A published version number is unique; a scheduled row shares no number yet
// (it gets one at promotion), so uniqueness is enforced only once published.
schema.index({ version: -1, status: 1 });
schema.index({ status: 1, effectiveFrom: 1 });
schema.index({ createdAt: -1 });

/** Immutable history — snapshots are never edited (status transitions aside). */
export const ConfigVersionModel = model<ConfigVersionDoc>('ConfigVersion', schema);
