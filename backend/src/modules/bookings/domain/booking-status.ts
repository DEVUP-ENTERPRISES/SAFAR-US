export type BookingStatus =
  | 'pending_verification'
  | 'pending_approval'
  | 'confirmed'
  | 'paid'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'cancelled_guest'
  | 'cancelled_host'
  | 'cancelled_system'
  | 'declined'
  | 'expired'
  | 'disputed';

/** Statuses a booking can never leave. */
export const TERMINAL_STATUSES: BookingStatus[] = [
  'cancelled',
  'cancelled_guest',
  'cancelled_host',
  'cancelled_system',
  'declined',
  'expired',
];

/**
 * Declarative transition map. `transitionTo` rejects anything not listed →
 * the lifecycle is auditable, testable, and impossible to shortcut.
 *
 * `pending_verification` holds a request whose guest has not cleared identity
 * checks. Funds are authorised but never captured from it, and it cannot move
 * forward until eligibility passes — see eligibility.service.
 *
 * The three `cancelled_*` statuses replace a single `cancelled` for new
 * bookings: who cancelled determines the refund maths, whether the host takes
 * a penalty, and whether Trust & Safety cares. Plain `cancelled` is kept so
 * bookings written before this split still load and still report correctly.
 */
export const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending_verification: [
    'pending_approval',
    'paid',
    'confirmed',
    'expired',
    'cancelled_guest',
    'cancelled_system',
    'cancelled',
  ],
  pending_approval: [
    'confirmed',
    'paid',
    'declined',
    'expired',
    'cancelled_guest',
    'cancelled_host',
    'cancelled_system',
    'cancelled',
  ],
  confirmed: ['paid', 'cancelled_guest', 'cancelled_host', 'cancelled_system', 'cancelled'],
  paid: ['in_progress', 'cancelled_guest', 'cancelled_host', 'cancelled_system', 'cancelled'],
  in_progress: ['completed', 'disputed'],
  completed: ['disputed'],
  disputed: ['completed'],

  cancelled: [],
  cancelled_guest: [],
  cancelled_host: [],
  cancelled_system: [],
  declined: [],
  expired: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Every way a booking can end up cancelled, for reporting and refund rules. */
export function isCancelled(status: BookingStatus): boolean {
  return (
    status === 'cancelled' ||
    status === 'cancelled_guest' ||
    status === 'cancelled_host' ||
    status === 'cancelled_system'
  );
}

/** Which party ended it — drives penalties and host acceptance metrics. */
export function cancelledBy(
  status: BookingStatus,
): 'guest' | 'host' | 'system' | 'unknown' | null {
  switch (status) {
    case 'cancelled_guest': return 'guest';
    case 'cancelled_host': return 'host';
    case 'cancelled_system': return 'system';
    case 'cancelled': return 'unknown'; // written before the split
    default: return null;
  }
}
