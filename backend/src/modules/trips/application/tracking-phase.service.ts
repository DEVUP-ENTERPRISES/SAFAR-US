import { TripModel, type TripDoc } from '../infrastructure/trip.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { platformConfigService } from '../../platform-config/application/platform-config.service';

/**
 * When location tracking is allowed, and who may see it.
 *
 * Ride-hailing tracks a driver for the twenty minutes they are being paid to
 * drive. A car rental is not that: the guest has the car for days and is living
 * their life in it. Streaming their position for the whole hire is surveillance
 * of a paying customer, and in the US it is also a legal problem — California
 * Civil Code 1936 restricts electronic surveillance of renters to narrow cases
 * such as recovering a stolen or overdue vehicle, with notice, and other states
 * follow suit.
 *
 * So tracking runs at the EDGES of a trip and is dark in the middle:
 *
 *   approach   both parties converging on the handover — the useful moment,
 *              and the one people actually want. Mutual.
 *   in_trip    nobody is tracked. The host sees status, never position.
 *   return     the same as approach, mirrored, so the host knows when to be
 *              there.
 *   exception  something is wrong: the guest raised SOS, the car is overdue
 *              past grace, or an incident is open. Tracking resumes, the guest
 *              is TOLD, and it is written to the audit log.
 *   off        before the window opens and after the trip closes.
 *
 * `reason` exists so the UI never shows a map without saying why it is there.
 */

export type TrackingPhase = 'off' | 'approach' | 'in_trip' | 'return' | 'exception';

export interface TrackingState {
  phase: TrackingPhase;
  /** May this trip accept location updates at all right now? */
  trackingEnabled: boolean;
  /** Who is expected to broadcast: both converging, or just the guest. */
  broadcasters: ('guest' | 'host')[];
  /** Who may watch. */
  viewers: ('guest' | 'host' | 'support')[];
  /** Plain-language reason, shown to both sides. Null when tracking is off. */
  reason: string | null;
  /** True when tracking is on because something went wrong. */
  isException: boolean;
  /** Which exception, for the audit trail. */
  exceptionKind?: 'sos' | 'overdue' | 'incident';
  /** When the approach window opens, so a client can schedule itself. */
  opensAt?: Date;
  /** When the current window closes. */
  closesAt?: Date;
}

const OFF: TrackingState = {
  phase: 'off',
  trackingEnabled: false,
  broadcasters: [],
  viewers: [],
  reason: null,
  isException: false,
};

const MIN = 60_000;

export const trackingPhaseService = {
  /**
   * Resolve the phase for a trip. Pure derivation from state and time — never
   * stored, so it cannot drift out of date or be left switched on.
   */
  async resolve(tripId: string): Promise<TrackingState> {
    const trip = await TripModel.findById(tripId).lean<TripDoc>();
    if (!trip) return OFF;
    return this.resolveFor(trip);
  },

  async resolveFor(trip: TripDoc): Promise<TrackingState> {
    if (trip.status === 'completed') return OFF;

    const cfg = await platformConfigService.get();
    const approachMinutes = cfg.tracking?.approachWindowMinutes ?? 60;
    const graceMinutes = cfg.tracking?.overdueGraceMinutes ?? 60;

    const booking = await BookingModel.findById(trip.bookingId).lean<{
      period?: { start?: Date; end?: Date };
    }>();
    const start = booking?.period?.start ? new Date(booking.period.start) : null;
    const end = booking?.period?.end ? new Date(booking.period.end) : null;
    const now = Date.now();

    // ── Exceptions outrank everything, including the quiet middle ────
    const openIncident = (trip.incidents ?? []).find((i) => i.status === 'open');
    // An SOS counts until the trip ends; it is not a state anyone raises lightly.
    const recentSos = (trip.sosEvents ?? []).length > 0;
    const overdue = !!end && !trip.return && now > end.getTime() + graceMinutes * MIN;

    if (recentSos || openIncident || overdue) {
      const kind: TrackingState['exceptionKind'] = recentSos ? 'sos' : openIncident ? 'incident' : 'overdue';
      return {
        phase: 'exception',
        trackingEnabled: true,
        broadcasters: ['guest'],
        // Support is added only here. During a normal trip nobody at the
        // company can see where a guest is either.
        viewers: ['guest', 'host', 'support'],
        reason:
          kind === 'sos'
            ? 'Location is shared because you raised an emergency. Turn it off by resolving the alert with support.'
            : kind === 'incident'
              ? 'Location is shared while an open incident on this trip is resolved.'
              : 'This car is overdue, so its location is shared with the host until it is returned.',
        isException: true,
        exceptionKind: kind,
      };
    }

    // ── Return approach ──────────────────────────────────────────────
    if (trip.checkin && end) {
      const opens = end.getTime() - approachMinutes * MIN;
      if (now >= opens) {
        return {
          phase: 'return',
          trackingEnabled: true,
          broadcasters: ['guest', 'host'],
          viewers: ['guest', 'host'],
          reason: 'You are both sharing location so the drop-off lines up.',
          isException: false,
          opensAt: new Date(opens),
          closesAt: end,
        };
      }
      // ── The quiet middle ───────────────────────────────────────────
      return {
        phase: 'in_trip',
        trackingEnabled: false,
        broadcasters: [],
        viewers: [],
        reason: null,
        isException: false,
        opensAt: new Date(opens),
      };
    }

    // ── Handover approach: before the keys change hands ──────────────
    if (!trip.checkin && start) {
      const opens = start.getTime() - approachMinutes * MIN;
      if (now >= opens) {
        return {
          phase: 'approach',
          trackingEnabled: true,
          broadcasters: ['guest', 'host'],
          viewers: ['guest', 'host'],
          reason: 'You are both sharing location until the car changes hands.',
          isException: false,
          opensAt: new Date(opens),
          closesAt: start,
        };
      }
      return { ...OFF, opensAt: new Date(opens) };
    }

    return OFF;
  },

  /** Guard for the socket and REST write paths. */
  async mayBroadcast(tripId: string, role: 'guest' | 'host'): Promise<boolean> {
    const s = await this.resolve(tripId);
    return s.trackingEnabled && s.broadcasters.includes(role);
  },

  async mayView(tripId: string, role: 'guest' | 'host' | 'support'): Promise<boolean> {
    const s = await this.resolve(tripId);
    return s.trackingEnabled && s.viewers.includes(role);
  },
};
