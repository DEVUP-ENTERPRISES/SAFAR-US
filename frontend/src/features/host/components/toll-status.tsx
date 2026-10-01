import { cn } from '@/lib/utils/cn';
import type { HostTollAccount } from '@/features/host/tolls-api';

const LOOK: Record<HostTollAccount['status'], { label: string; className: string }> = {
  connected: { label: 'Connected', className: 'bg-success/15 text-success' },
  // Login saved; tolls arrive from statements until NTTA opens automatic access.
  manual: { label: 'Linked', className: 'bg-primary/10 text-primary' },
  disconnected: { label: 'Disconnected', className: 'bg-destructive/15 text-destructive' },
};

export function TollStatusPill({ status, className }: { status: HostTollAccount['status']; className?: string }) {
  const s = LOOK[status];
  return <span className={cn('inline-flex rounded-md px-2.5 py-1 text-sm font-semibold', s.className, className)}>{s.label}</span>;
}
