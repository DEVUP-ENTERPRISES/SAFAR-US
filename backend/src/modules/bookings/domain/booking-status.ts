export type BookingStatus =
  | 'pending_approval'
  | 'confirmed'
  | 'paid'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'declined'
  | 'expired'
  | 'disputed';

/**
 * Declarative transition map. `transitionTo` rejects anything not listed →
 * the lifecycle is auditable, testable, and impossible to shortcut.
 */
export const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending_approval: ['confirmed', 'paid', 'declined', 'expired', 'cancelled'],
  confirmed: ['paid', 'cancelled'],
  paid: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'disputed'],
  completed: ['disputed'],
  cancelled: [],
  declined: [],
  expired: [],
  disputed: ['completed'],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
