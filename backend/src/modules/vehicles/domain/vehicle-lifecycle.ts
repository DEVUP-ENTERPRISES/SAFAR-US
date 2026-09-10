/**
 * The vehicle OPERATIONAL lifecycle — where a physical car is in its day-to-day
 * cycle of trips, cleaning, maintenance and repair.
 *
 * This is deliberately SEPARATE from the marketplace `status`
 * (draft/listed/paused/delisted), which answers "may a host show this car and
 * take future-dated bookings". Operational state answers a different question —
 * "what is happening to the car right now, and can it operate at all". A car
 * can be `listed` (bookable for next month) while physically `on_trip` today.
 *
 * Keeping them apart is what lets the two evolve independently: search and
 * availability keep reading `status`; ops, safety and reactivation read
 * `operationalState`. Only the states that mean the car is physically DOWN
 * (maintenance / repair / blocked / awaiting_approval) also stop NEW bookings,
 * because a car that cannot safely operate must not be handed to anyone.
 */
export type OperationalState =
  /** Listed and free — ready to be reserved, picked up and driven. */
  | 'idle'
  /** Reserved by a confirmed/paid booking, not yet handed over. */
  | 'booked'
  /** Handed over — an active trip is under way. */
  | 'on_trip'
  /** Returned by the guest, awaiting post-trip inspection. */
  | 'returned'
  /** Post-trip inspection in progress. */
  | 'inspecting'
  /** Being cleaned between trips. */
  | 'cleaning'
  /** Scheduled / preventive / due maintenance in progress. */
  | 'maintenance'
  /** In repair after damage or an incident. */
  | 'repair'
  /** Work done; needs management/ops approval before it can operate again. */
  | 'awaiting_approval'
  /** Safety or compliance hold — cannot operate until explicitly cleared. */
  | 'blocked';

export const OPERATIONAL_STATES: readonly OperationalState[] = [
  'idle', 'booked', 'on_trip', 'returned', 'inspecting',
  'cleaning', 'maintenance', 'repair', 'awaiting_approval', 'blocked',
] as const;

/**
 * States in which the car is physically unable to take a NEW trip. A booking
 * request against a car in one of these is rejected — this is the seam that
 * makes "safety-critical maintenance prevents new bookings" real, without
 * touching the host-facing `status`.
 *
 * `on_trip` and `booked` are NOT here: they describe a point-in-time physical
 * state, not a date range. A car out on a trip today is still bookable for
 * future dates — the availability calendar, not this flag, prevents overlaps.
 */
export const BOOKING_BLOCKING_STATES: readonly OperationalState[] = [
  'maintenance', 'repair', 'awaiting_approval', 'blocked',
] as const;

export function blocksNewBookings(state: OperationalState): boolean {
  return (BOOKING_BLOCKING_STATES as readonly string[]).includes(state);
}

/**
 * Declarative transition map. Anything not listed is rejected, so the lifecycle
 * is auditable and impossible to shortcut. Mirrors the operations flow:
 *
 *   idle → booked → on_trip → returned → inspecting → cleaning
 *        → (maintenance | repair) → awaiting_approval → idle
 *
 * A safety hold (`blocked`) can be entered from ANY state — an emergency must
 * never be blocked by a state-machine rule — so it is appended to every row
 * by `withUniversalHold` below rather than repeated by hand.
 */
const BASE_TRANSITIONS: Record<OperationalState, OperationalState[]> = {
  idle: ['booked', 'on_trip', 'cleaning', 'maintenance', 'inspecting'],
  // A reservation can start (handover), be released back to free (cancellation),
  // or the car can be pulled for servicing before pickup.
  booked: ['on_trip', 'idle', 'maintenance'],
  // A trip only ever ends by return. Incidents pause the trip but do not change
  // the operational state — the car is still physically out with the guest.
  on_trip: ['returned'],
  // Any non-down state can begin the next trip (a clean, idle or inspected car
  // is ready to go). The down states below deliberately cannot reach on_trip
  // directly — they must clear through approval first, which is the
  // reactivation gate.
  returned: ['inspecting', 'cleaning', 'idle', 'on_trip'],
  inspecting: ['cleaning', 'maintenance', 'repair', 'awaiting_approval', 'idle', 'on_trip'],
  cleaning: ['inspecting', 'maintenance', 'awaiting_approval', 'idle', 'on_trip'],
  maintenance: ['repair', 'inspecting', 'awaiting_approval', 'idle'],
  repair: ['inspecting', 'awaiting_approval'],
  // Approval is the gate before a down car returns to service (reactivation) or
  // is sent back for more work.
  awaiting_approval: ['idle', 'repair', 'maintenance'],
  // A hold is cleared into whatever comes next — usually more work, or straight
  // back to service once the issue is resolved.
  blocked: ['inspecting', 'maintenance', 'repair', 'awaiting_approval', 'idle'],
};

function withUniversalHold(
  map: Record<OperationalState, OperationalState[]>,
): Record<OperationalState, OperationalState[]> {
  const out = {} as Record<OperationalState, OperationalState[]>;
  for (const state of OPERATIONAL_STATES) {
    const next = new Set(map[state]);
    if (state !== 'blocked') next.add('blocked'); // safety hold from anywhere
    out[state] = [...next];
  }
  return out;
}

export const ALLOWED_TRANSITIONS = withUniversalHold(BASE_TRANSITIONS);

export function canTransition(from: OperationalState, to: OperationalState): boolean {
  if (from === to) return true; // idempotent no-op is always "allowed"
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Why a transition is illegal, for error copy and audit. Null when allowed. */
export function transitionError(from: OperationalState, to: OperationalState): string | null {
  if (!(OPERATIONAL_STATES as readonly string[]).includes(to)) return `Unknown state: ${to}`;
  if (canTransition(from, to)) return null;
  return `A vehicle cannot move from ${from} to ${to}.`;
}
