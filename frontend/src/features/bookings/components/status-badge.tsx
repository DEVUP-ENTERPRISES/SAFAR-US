import { Badge } from '@/components/ui/badge';
import type { BookingStatus } from '../types';

const TONE: Record<BookingStatus, 'default' | 'success' | 'warning' | 'destructive' | 'muted'> = {
  pending_verification: 'warning',
  pending_approval: 'warning',
  confirmed: 'default',
  paid: 'success',
  in_progress: 'default',
  completed: 'success',
  cancelled: 'destructive',
  cancelled_guest: 'muted',
  cancelled_host: 'destructive',
  cancelled_system: 'muted',
  declined: 'destructive',
  expired: 'muted',
  disputed: 'destructive',
};

/**
 * Plain-English labels. "cancelled_host" is not a thing a guest should have to
 * decode, and it matters to them WHO cancelled — a host cancelling is the case
 * where they are owed a replacement car.
 */
const LABEL: Record<BookingStatus, string> = {
  pending_verification: 'Verifying you',
  pending_approval: 'Awaiting host',
  confirmed: 'Confirmed',
  paid: 'Confirmed',
  in_progress: 'On trip',
  completed: 'Completed',
  cancelled: 'Cancelled',
  cancelled_guest: 'Cancelled by you',
  cancelled_host: 'Cancelled by host',
  cancelled_system: 'Cancelled',
  declined: 'Declined',
  expired: 'Expired',
  disputed: 'Disputed',
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <Badge tone={TONE[status] ?? 'muted'}>{LABEL[status] ?? status.replace(/_/g, ' ')}</Badge>;
}
