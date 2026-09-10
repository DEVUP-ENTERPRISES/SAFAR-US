import {
  canTransition,
  transitionError,
  blocksNewBookings,
  ALLOWED_TRANSITIONS,
  OPERATIONAL_STATES,
  type OperationalState,
} from './vehicle-lifecycle';

describe('vehicle lifecycle state machine', () => {
  it('allows the core operational path', () => {
    expect(canTransition('idle', 'on_trip')).toBe(true);
    expect(canTransition('on_trip', 'returned')).toBe(true);
    expect(canTransition('returned', 'inspecting')).toBe(true);
    expect(canTransition('inspecting', 'repair')).toBe(true);
    expect(canTransition('repair', 'awaiting_approval')).toBe(true);
    expect(canTransition('awaiting_approval', 'idle')).toBe(true); // reactivation
  });

  it('rejects illegal jumps', () => {
    // A car out on a trip cannot teleport into maintenance.
    expect(canTransition('on_trip', 'maintenance')).toBe(false);
    // A down car cannot go straight back on a trip — it must clear approval.
    expect(canTransition('repair', 'on_trip')).toBe(false);
    expect(canTransition('maintenance', 'on_trip')).toBe(false);
    expect(canTransition('awaiting_approval', 'on_trip')).toBe(false);
  });

  it('treats a same-state move as an idempotent no-op (allowed)', () => {
    for (const s of OPERATIONAL_STATES) expect(canTransition(s, s)).toBe(true);
  });

  it('can enter a safety hold from ANY state', () => {
    for (const s of OPERATIONAL_STATES) {
      if (s === 'blocked') continue;
      expect(canTransition(s, 'blocked')).toBe(true);
    }
  });

  it('marks only the physically-down states as booking-blocking', () => {
    expect(blocksNewBookings('maintenance')).toBe(true);
    expect(blocksNewBookings('repair')).toBe(true);
    expect(blocksNewBookings('awaiting_approval')).toBe(true);
    expect(blocksNewBookings('blocked')).toBe(true);
    // Out on a trip / reserved / being cleaned does NOT block future bookings.
    expect(blocksNewBookings('idle')).toBe(false);
    expect(blocksNewBookings('booked')).toBe(false);
    expect(blocksNewBookings('on_trip')).toBe(false);
    expect(blocksNewBookings('returned')).toBe(false);
    expect(blocksNewBookings('cleaning')).toBe(false);
    expect(blocksNewBookings('inspecting')).toBe(false);
  });

  it('reports a reason for an illegal transition and null for a legal one', () => {
    expect(transitionError('on_trip', 'maintenance')).toMatch(/cannot move/i);
    expect(transitionError('idle', 'on_trip')).toBeNull();
    expect(transitionError('idle', 'nonsense' as OperationalState)).toMatch(/unknown state/i);
  });

  it('every state has an entry in the transition map', () => {
    for (const s of OPERATIONAL_STATES) {
      expect(Array.isArray(ALLOWED_TRANSITIONS[s])).toBe(true);
    }
  });
});
