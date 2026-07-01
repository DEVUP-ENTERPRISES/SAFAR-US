import { Badge } from '@/components/ui/badge';
import type { BookingStatus } from '../types';

const TONE: Record<BookingStatus, 'default' | 'success' | 'warning' | 'destructive' | 'muted'> = {
  pending_approval: 'warning',
  confirmed: 'default',
  paid: 'success',
  in_progress: 'default',
  completed: 'success',
  cancelled: 'destructive',
  declined: 'destructive',
  expired: 'muted',
  disputed: 'destructive',
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <Badge tone={TONE[status]}>{status.replace(/_/g, ' ')}</Badge>;
}
