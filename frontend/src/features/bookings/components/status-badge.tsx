import { Badge } from '@/components/ui/badge';
import type { BookingStatus } from '../types';
import { STATUS_TONE, statusLabel } from '../status';

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <Badge tone={STATUS_TONE[status] ?? 'muted'}>{statusLabel(status)}</Badge>;
}
