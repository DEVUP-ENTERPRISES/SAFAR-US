import { VehicleModel } from '../infrastructure/vehicle.model';
import {
  VehicleEventModel,
  type VehicleEventDoc,
  type VehicleEventKind,
  type EvidenceRef,
} from '../infrastructure/vehicle-event.model';
import {
  type OperationalState,
  transitionError,
  blocksNewBookings,
} from '../domain/vehicle-lifecycle';
import { auditService } from '../../audit/application/audit.service';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { ConflictError, NotFoundError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';

export interface Actor {
  userId?: string;
  roles?: string[];
  /** true when the transition is driven by the system (a job or an event). */
  system?: boolean;
}

export interface RecordInput {
  vehicleId: string;
  kind: VehicleEventKind;
  summary: string;
  actor: Actor;
  at?: Date;
  reason?: string;
  evidence?: EvidenceRef[];
  location?: { type: 'Point'; coordinates: [number, number]; address?: string };
  bookingId?: string;
  tripId?: string;
  sourceType?: string;
  sourceId?: string;
  fromState?: OperationalState;
  toState?: OperationalState;
  data?: Record<string, unknown>;
  /** Replays with the same key collapse to one record. */
  idempotencyKey?: string;
}

export interface TransitionInput {
  vehicleId: string;
  to: OperationalState;
  actor: Actor;
  reason?: string;
  evidence?: EvidenceRef[];
  location?: { type: 'Point'; coordinates: [number, number]; address?: string };
  bookingId?: string;
  tripId?: string;
  sourceType?: string;
  sourceId?: string;
  data?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface TransitionResult {
  changed: boolean;
  from: OperationalState;
  to: OperationalState;
}

const MONGO_DUPLICATE_KEY = 11000;

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === MONGO_DUPLICATE_KEY;
}

/**
 * The vehicle lifecycle engine.
 *
 * Two public verbs. `record` appends a fact to the timeline (§21/§3). `transition`
 * moves the operational state through the validated state machine and appends
 * the corresponding fact. Everything an operations workflow does — cleaning,
 * maintenance, repair, reactivation — is one of these two.
 *
 * Every transition is:
 *   - server-side & validated (the domain machine rejects illegal moves)
 *   - concurrency-safe (a conditional update on the expected `from` state; a
 *     losing racer is detected by matchedCount 0, never a lost update)
 *   - idempotent where a key is supplied (a unique index on the timeline makes
 *     a replay a no-op)
 *   - auditable (an audit record + an immutable timeline entry)
 *   - associated with the vehicle, and with the booking/trip/evidence when given
 */
export class VehicleLifecycleService {
  /**
   * Allocate the next per-vehicle sequence number with an atomic $inc, so two
   * concurrent writers can never receive the same seq. Returns null when the
   * vehicle does not exist.
   */
  private async nextSeq(vehicleId: string): Promise<number | null> {
    const updated = await VehicleModel.findOneAndUpdate(
      { _id: vehicleId },
      { $inc: { 'lifecycle.timelineSeq': 1 } },
      { new: true, projection: { 'lifecycle.timelineSeq': 1 } },
    ).lean<{ lifecycle?: { timelineSeq?: number } }>();
    return updated?.lifecycle?.timelineSeq ?? null;
  }

  /** Append one immutable fact to a vehicle's timeline. */
  async record(input: RecordInput): Promise<VehicleEventDoc | null> {
    const seq = await this.nextSeq(input.vehicleId);
    if (seq == null) {
      logger.warn({ vehicleId: input.vehicleId }, 'timeline record skipped — vehicle not found');
      return null;
    }
    try {
      return await VehicleEventModel.create({
        vehicleId: input.vehicleId,
        seq,
        kind: input.kind,
        fromState: input.fromState,
        toState: input.toState,
        actor: input.actor,
        summary: input.summary,
        at: input.at ?? new Date(),
        location: input.location,
        reason: input.reason,
        evidence: input.evidence ?? [],
        bookingId: input.bookingId,
        tripId: input.tripId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        data: input.data,
        idempotencyKey: input.idempotencyKey,
      });
    } catch (err) {
      // A replay with the same idempotency key collapses to the existing record.
      if (isDuplicateKeyError(err) && input.idempotencyKey) {
        return VehicleEventModel.findOne({ idempotencyKey: input.idempotencyKey }).lean<VehicleEventDoc>();
      }
      throw err;
    }
  }

  /**
   * Move a vehicle's operational state. Rejects illegal moves, is safe under
   * concurrency, and records both an audit entry and a timeline event.
   */
  async transition(input: TransitionInput): Promise<TransitionResult> {
    // A supplied key already recorded means this exact transition already ran.
    if (input.idempotencyKey) {
      const prior = await VehicleEventModel.findOne({ idempotencyKey: input.idempotencyKey }).lean<VehicleEventDoc>();
      if (prior) {
        return {
          changed: false,
          from: (prior.fromState ?? 'idle') as OperationalState,
          to: (prior.toState ?? input.to),
        };
      }
    }

    const current = await VehicleModel.findById(input.vehicleId, { operationalState: 1 }).lean<{
      operationalState?: OperationalState;
    }>();
    if (!current) throw new NotFoundError('Vehicle');
    const from: OperationalState = current.operationalState ?? 'idle';
    const to = input.to;

    if (from === to) {
      return { changed: false, from, to };
    }

    const illegal = transitionError(from, to);
    if (illegal) throw new ConflictError(illegal, 'INVALID_LIFECYCLE_TRANSITION');

    // Concurrency-safe: only move if the state is still what we validated
    // against. A racer that already moved it makes matchedCount 0.
    const nowBlocking = blocksNewBookings(to);
    const wasBlocking = blocksNewBookings(from);
    const set: Record<string, unknown> = { operationalState: to };
    const unset: Record<string, unknown> = {};
    if (nowBlocking) {
      set['lifecycle.downReason'] = input.reason ?? `Vehicle ${to}`;
      if (!wasBlocking) set['lifecycle.downSince'] = new Date();
    } else if (wasBlocking) {
      unset['lifecycle.downReason'] = '';
      unset['lifecycle.downSince'] = '';
    }

    const update: Record<string, unknown> = { $set: set };
    if (Object.keys(unset).length) update.$unset = unset;

    const res = await VehicleModel.updateOne(
      { _id: input.vehicleId, operationalState: from },
      update,
    );

    if (res.matchedCount === 0) {
      // Someone moved it first. If they moved it to where we wanted, treat as a
      // satisfied no-op; otherwise it is a genuine conflict.
      const after = await VehicleModel.findById(input.vehicleId, { operationalState: 1 }).lean<{
        operationalState?: OperationalState;
      }>();
      if ((after?.operationalState ?? 'idle') === to) return { changed: false, from, to };
      throw new ConflictError('Vehicle state changed concurrently — retry.', 'LIFECYCLE_RACE');
    }

    await this.record({
      vehicleId: input.vehicleId,
      kind: 'state.changed',
      summary: input.actor.system
        ? `State changed ${from} → ${to}`
        : `State changed ${from} → ${to} by ${input.actor.userId ?? 'unknown'}`,
      actor: input.actor,
      reason: input.reason,
      evidence: input.evidence,
      location: input.location,
      bookingId: input.bookingId,
      tripId: input.tripId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      fromState: from,
      toState: to,
      data: input.data,
      idempotencyKey: input.idempotencyKey,
    });

    await auditService.record({
      actorId: input.actor.userId ?? 'system',
      actorRoles: input.actor.roles ?? (input.actor.system ? ['system'] : []),
      action: EVENTS.VEHICLE_STATE_CHANGED,
      resourceType: 'vehicle',
      resourceId: input.vehicleId,
      before: { operationalState: from },
      after: { operationalState: to },
      reason: input.reason,
      status: 200,
    });

    emit(EVENTS.VEHICLE_STATE_CHANGED, input.vehicleId, {
      vehicleId: input.vehicleId,
      from,
      to,
      by: input.actor.userId,
    });
    if (nowBlocking && !wasBlocking) {
      emit(EVENTS.VEHICLE_DOWN, input.vehicleId, { vehicleId: input.vehicleId, state: to, reason: input.reason });
    }
    if (!nowBlocking && wasBlocking && to === 'idle') {
      emit(EVENTS.VEHICLE_REACTIVATED, input.vehicleId, { vehicleId: input.vehicleId });
    }

    return { changed: true, from, to };
  }

  /** Current operational state (defaults to idle for legacy rows). */
  async stateOf(vehicleId: string): Promise<OperationalState> {
    const v = await VehicleModel.findById(vehicleId, { operationalState: 1 }).lean<{
      operationalState?: OperationalState;
    }>();
    return v?.operationalState ?? 'idle';
  }

  /**
   * May this car accept a NEW booking, operationally? False only when the car
   * is physically down. This is the additive guard the booking path consults —
   * it never blocks a car that is merely out on a trip or reserved.
   */
  async isOperableForBooking(vehicleId: string): Promise<boolean> {
    return !blocksNewBookings(await this.stateOf(vehicleId));
  }

  /** A vehicle's timeline, newest first. */
  async timeline(
    vehicleId: string,
    opts: { limit?: number; beforeSeq?: number; kinds?: VehicleEventKind[] } = {},
  ): Promise<VehicleEventDoc[]> {
    const filter: Record<string, unknown> = { vehicleId };
    if (opts.beforeSeq != null) filter.seq = { $lt: opts.beforeSeq };
    if (opts.kinds?.length) filter.kind = { $in: opts.kinds };
    return VehicleEventModel.find(filter)
      .sort({ seq: -1 })
      .limit(Math.min(opts.limit ?? 100, 200))
      .lean<VehicleEventDoc[]>();
  }
}

export const vehicleLifecycleService = new VehicleLifecycleService();
