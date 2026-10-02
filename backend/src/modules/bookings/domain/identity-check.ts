import { ConflictError } from '../../../core/errors/app-error';
import type { BookingDoc } from '../infrastructure/booking.model';

/** Refuse a pickup or trip start while the host's "not the same person" report is open. */
export function assertIdentityNotBlocked(booking: Pick<BookingDoc, 'identityCheck'>): void {
  if (booking.identityCheck?.result === 'mismatch' && !booking.identityCheck.clearedAt) {
    throw new ConflictError('The host reported that the person at pickup did not match the verified guest. Our team is checking; the trip cannot start until they confirm.', 'IDENTITY_MISMATCH');
  }
}
