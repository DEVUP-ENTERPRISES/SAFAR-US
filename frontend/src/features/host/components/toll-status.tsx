import { cn } from '@/lib/utils/cn';
import { TOLL_STATUS, type HostTollAccount } from '@/features/host/tolls-api';

const CLASS: Record<HostTollAccount['status'], string> = {
  connected: 'bg-success/15 text-success',
  manual: 'bg-primary/10 text-primary',
  disconnected: 'bg-destructive/15 text-destructive',
};

export function TollStatusPill({ status, className }: { status: HostTollAccount['status']; className?: string }) {
  return <span className={cn('inline-flex rounded-md px-2.5 py-1 text-sm font-semibold', CLASS[status], className)}>{TOLL_STATUS[status].label}</span>;
}
