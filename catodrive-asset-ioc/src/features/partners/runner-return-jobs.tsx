'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { RETURN_STATUS, runnerReturnsApi } from '@/features/asset-partners/returns-api';
import { formatDate } from '@/lib/utils/format';

/** Car returns assigned to this Captain; hidden when there are none. */
export function RunnerReturnJobs() {
  const q = useQuery({ queryKey: ['runner-returns'], queryFn: () => runnerReturnsApi.mine(), retry: false });
  if (!q.data?.length) return null;
  return (
    <section aria-label="Car returns" className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Car returns</p>
      <ul className="space-y-2">
        {q.data.map((j) => (
          <li key={j._id}>
            <Link href={`/captain/returns/${j._id}`} className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 hover:bg-accent">
              <Undo2 className="h-5 w-5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{j.cars.map((c) => c.label).join(', ')}</span>
                <span className="block text-xs text-muted-foreground">{j.reference}{j.scheduledFor ? ` · ${formatDate(j.scheduledFor)}` : ''}{j.sentBack ? ' · sent back' : ''}</span>
              </span>
              <Badge tone={j.sentBack ? 'warning' : RETURN_STATUS[j.status].tone}>{j.sentBack && j.status === 'in_progress' ? 'Fix and resend' : RETURN_STATUS[j.status].label}</Badge>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
