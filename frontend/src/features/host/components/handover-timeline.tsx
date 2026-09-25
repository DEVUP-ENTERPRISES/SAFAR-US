'use client';

import { Check, Lock } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { TimelineStep } from '../trips.api';

/** The handover steps in order; renders nothing when the backend sends no timeline. */
export function HandoverTimeline({ timeline }: { timeline?: TimelineStep[] | null }) {
  if (!timeline || timeline.length === 0) return null;

  return (
    <ol className="rounded-2xl border border-border bg-card p-4">
      {timeline.map((s, i) => {
        const muted = s.state === 'todo' || s.state === 'locked';
        return (
          <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
            {i < timeline.length - 1 && <span className="absolute start-[11px] top-6 h-[calc(100%-1.5rem)] w-px bg-border" />}
            <span
              className={cn(
                'z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-bold',
                s.state === 'done' && 'border-success bg-success text-white',
                s.state === 'current' && 'border-primary bg-primary text-primary-foreground',
                muted && 'border-border bg-muted text-muted-foreground',
              )}
            >
              {s.state === 'done' ? <Check className="h-3.5 w-3.5" /> : s.state === 'locked' ? <Lock className="h-3 w-3" /> : i + 1}
            </span>
            <div className="min-w-0">
              <p className={cn('text-sm font-semibold', muted && 'text-muted-foreground', s.state === 'current' && 'text-primary')}>{s.label}</p>
              {s.detail && (s.state === 'current' || s.state === 'locked') && (
                <p className="text-xs text-muted-foreground">{s.detail}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** One line for a trip row: what has to happen next. */
export function NextHandoverStep({ timeline }: { timeline?: TimelineStep[] | null }) {
  const cur = timeline?.find((s) => s.state === 'current');
  if (!cur) return null;
  return (
    <p className="mt-2 truncate text-[13px] font-medium text-primary">
      Next: {cur.label}{cur.detail ? ` — ${cur.detail}` : ''}
    </p>
  );
}
