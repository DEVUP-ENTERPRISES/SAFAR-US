import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';
import type { OperationalState } from '../domain/vehicle-lifecycle';

/**
 * The vehicle master timeline (§21) and the immutable evidence log (§3), as one
 * system. Every operationally-significant thing that happens to a car — a state
 * change, a trip milestone, an inspection, damage, a document expiry, a repair —
 * is one append-only record here. It answers, for any car, the only question an
 * investigation or a dispute ever asks:
 *
 *   WHO did WHAT, WHEN, WHERE, WHY, and with what EVIDENCE.
 *
 * Append-only by contract: records are never updated or deleted (a `pre` hook
 * throws on any update). Correcting the record means appending a new event that
 * supersedes an earlier one — the original stays, so the history cannot be
 * quietly rewritten. `seq` is a per-vehicle monotonic counter (allocated by an
 * atomic $inc on the vehicle) so events have a stable total order even when two
 * are written in the same millisecond.
 */
export type VehicleEventKind =
  | 'state.changed'
  | 'lifecycle.note'
  | 'trip.started'
  | 'trip.completed'
  | 'trip.checked_in'
  | 'inspection.recorded'
  | 'damage.reported'
  | 'incident.raised'
  | 'incident.resolved'
  | 'cleaning.recorded'
  | 'maintenance.due'
  | 'maintenance.recorded'
  | 'repair.recorded'
  | 'document.expired'
  | 'document.renewed'
  | 'approval.recorded'
  | 'reactivated'
  | 'blocked';

export interface EvidenceRef {
  /** photo | video | document | receipt | report | external */
  kind: string;
  /** Public/CDN URL when there is one. */
  url?: string;
  /** S3 key for private objects served through a signed URL. */
  key?: string;
  /** Free reference for external evidence (police report #, claim id, …). */
  ref?: string;
  label?: string;
}

export interface VehicleEventDoc {
  _id: string;
  vehicleId: string;
  /** Per-vehicle monotonic sequence — the authoritative total order. */
  seq: number;
  kind: VehicleEventKind;
  /** Present on `state.changed`. */
  fromState?: OperationalState;
  toState?: OperationalState;

  // WHO
  actor: { userId?: string; roles?: string[]; system?: boolean };
  // WHAT (human-readable one-liner)
  summary: string;
  // WHEN
  at: Date;
  // WHERE (optional GeoJSON point)
  location?: { type: 'Point'; coordinates: [number, number]; address?: string };
  // WHY
  reason?: string;
  // EVIDENCE
  evidence: EvidenceRef[];

  // Associations
  bookingId?: string;
  tripId?: string;
  /** Links the event back to the record that caused it (claim, maintenance…). */
  sourceType?: string;
  sourceId?: string;
  /** Arbitrary structured detail specific to the kind. */
  data?: Record<string, unknown>;
  /** Dedupe key — a unique index makes replays (webhooks, retries) no-ops. */
  idempotencyKey?: string;
  createdAt: Date;
}

const schema = new Schema<VehicleEventDoc>(
  {
    _id: { type: String, default: () => uuid() },
    vehicleId: { type: String, required: true },
    seq: { type: Number, required: true },
    kind: { type: String, required: true },
    fromState: String,
    toState: String,
    actor: {
      userId: String,
      roles: { type: [String], default: undefined },
      system: Boolean,
    },
    summary: { type: String, required: true },
    at: { type: Date, required: true },
    location: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number] },
      address: String,
    },
    reason: String,
    evidence: {
      type: [{ _id: false, kind: String, url: String, key: String, ref: String, label: String }],
      default: [],
    },
    bookingId: String,
    tripId: String,
    sourceType: String,
    sourceId: String,
    data: Schema.Types.Mixed,
    idempotencyKey: String,
  },
  { timestamps: { createdAt: true, updatedAt: false }, _id: false },
);

// The timeline read: a vehicle's whole life, newest first, and a stable total
// order via seq. Unique (vehicleId, seq) also guards against a double-allocated
// sequence.
schema.index({ vehicleId: 1, seq: -1 }, { unique: true });
schema.index({ vehicleId: 1, at: -1 });
schema.index({ kind: 1, at: -1 });
schema.index({ bookingId: 1 });
schema.index({ tripId: 1 });
// Replays and retries collapse to one record.
schema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

/**
 * Immutable by contract. Any attempt to update or delete an existing event is a
 * bug (or tampering) — reject it loudly rather than let the history change.
 * Inserts go through `Model.create`, which does not trigger these hooks.
 */
function blockMutation(this: unknown, next: (err?: Error) => void): void {
  next(new Error('VehicleEvent records are append-only and cannot be modified or removed.'));
}
schema.pre('updateOne', blockMutation);
schema.pre('updateMany', blockMutation);
schema.pre('findOneAndUpdate', blockMutation);
schema.pre('deleteOne', blockMutation);
schema.pre('deleteMany', blockMutation);

export const VehicleEventModel = model<VehicleEventDoc>('VehicleEvent', schema);
