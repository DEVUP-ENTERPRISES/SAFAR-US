import {
  canTransition, isCancelled, ALLOWED_TRANSITIONS, TERMINAL_STATUSES, type BookingStatus,
} from './booking-status';

/**
 * The booking state machine.
 *
 * This is the spine of the product: a booking that can move somewhere it should
 * not is a trip that happens without payment, a car double-let, or a refund
 * against money never taken. Testing the machine directly is worth more than
 * testing any one flow through it.
 */
describe('booking state machine', () => {
  const ALL = Object.keys(ALLOWED_TRANSITIONS) as BookingStatus[];

  it('lists a transition set for every status', () => {
    // A status missing from the map returns false for everything, silently
    // stranding any booking that reaches it.
    for (const s of ALL) expect(Array.isArray(ALLOWED_TRANSITIONS[s])).toBe(true);
  });

  it('never allows a transition to an unknown status', () => {
    for (const from of ALL) {
      for (const to of ALLOWED_TRANSITIONS[from]) {
        expect(ALL).toContain(to);
      }
    }
  });

  it('lets nothing escape a terminal status', () => {
    // A cancelled booking that can be revived is a car let out from under
    // whoever booked it next.
    for (const t of TERMINAL_STATUSES) {
      expect(ALLOWED_TRANSITIONS[t]).toHaveLength(0);
    }
  });

  it('lets a completed trip be disputed, and nothing else', () => {
    // Damage is often found after the keys are back. A finished trip must stay
    // disputable — but must not be re-cancelled, re-paid or restarted.
    const reachable = ALL.filter((to) => canTransition('completed', to));
    expect(reachable).toEqual(['disputed']);
  });

  it('lets a resolved dispute close the trip again', () => {
    expect(canTransition('disputed', 'completed')).toBe(true);
  });

  it('never allows a status to transition to itself', () => {
    // A self-transition means a duplicate request re-runs the side effects of
    // an event that already happened.
    for (const s of ALL) expect(canTransition(s, s)).toBe(false);
  });

  describe('the paths that move money', () => {
    it('lets a payment-challenged booking clear into paid', () => {
      expect(canTransition('pending_payment', 'paid')).toBe(true);
    });

    it('lets an abandoned challenge expire', () => {
      expect(canTransition('pending_payment', 'expired')).toBe(true);
    });

    it('does NOT let an unpaid booking start a trip', () => {
      // The one that matters most: a host must never be sent to a handover for
      // a booking whose money did not move.
      expect(canTransition('pending_payment', 'in_progress')).toBe(false);
      expect(canTransition('pending_verification', 'in_progress')).toBe(false);
      expect(canTransition('pending_approval', 'in_progress')).toBe(false);
    });

    it('only reaches in_progress from paid', () => {
      const sources = ALL.filter((s) => canTransition(s, 'in_progress'));
      expect(sources).toEqual(['paid']);
    });

    it('only reaches completed from a live trip or a resolved dispute', () => {
      // Nothing unpaid or unstarted may jump straight to completed.
      const sources = ALL.filter((s) => canTransition(s, 'completed'));
      expect(sources.sort()).toEqual(['disputed', 'in_progress']);
    });
  });

  describe('cancellation', () => {
    it('can cancel a live booking', () => {
      expect(canTransition('paid', 'cancelled_guest')).toBe(true);
      expect(canTransition('paid', 'cancelled_host')).toBe(true);
    });

    it('cannot cancel a finished trip', () => {
      expect(canTransition('completed', 'cancelled_guest')).toBe(false);
    });

    it('recognises every cancelled variant', () => {
      expect(isCancelled('cancelled')).toBe(true);
      expect(isCancelled('cancelled_guest')).toBe(true);
      expect(isCancelled('cancelled_host')).toBe(true);
      expect(isCancelled('cancelled_system')).toBe(true);
      expect(isCancelled('declined')).toBe(false);
      expect(isCancelled('expired')).toBe(false);
      expect(isCancelled('paid')).toBe(false);
    });
  });

  it('rejects an unknown status defensively', () => {
    expect(canTransition('not_a_status' as BookingStatus, 'paid')).toBe(false);
  });
});
