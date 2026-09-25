'use client';

import type { ReactNode } from 'react';
import { Check, Lock } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type StepStatus = 'done' | 'active' | 'locked' | 'na';

/** One numbered step of the host's pickup checklist; locked steps say why. */
export function HandoverStep({
  id,
  n,
  title,
  status,
  summary,
  lockedReason,
  showWhenLocked = false,
  children,
}: {
  id: string;
  n: number;
  title: string;
  status: StepStatus;
  summary?: string;
  lockedReason?: string;
  /** Keep the (disabled) controls visible while locked, e.g. the odometer fields. */
  showWhenLocked?: boolean;
  children?: ReactNode;
}) {
  const locked = status === 'locked';
  return (
    <section
      id={id}
      className={cn(
        'scroll-mt-4 rounded-2xl border bg-card p-4',
        status === 'active' ? 'border-primary/50' : 'border-border',
        (locked || status === 'na') && 'bg-muted/30',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold',
            status === 'done' && 'bg-success text-white',
            status === 'active' && 'bg-primary text-primary-foreground',
            (locked || status === 'na') && 'bg-muted text-muted-foreground',
          )}
        >
          {status === 'done' ? <Check className="h-3.5 w-3.5" /> : locked ? <Lock className="h-3 w-3" /> : n}
        </span>
        <p className={cn('flex-1 text-sm font-semibold', (locked || status === 'na') && 'text-muted-foreground')}>{title}</p>
        {status === 'na' && <span className="text-xs font-medium text-muted-foreground">Not required</span>}
        {summary && status !== 'na' && <span className="text-xs font-semibold text-muted-foreground">{summary}</span>}
      </div>

      {locked && lockedReason && <p className="mt-2 text-xs text-muted-foreground">{lockedReason}</p>}

      {status !== 'na' && (!locked || showWhenLocked) && children && (
        <fieldset disabled={locked} className={cn('mt-3 space-y-3', locked && 'opacity-50')}>
          {children}
        </fieldset>
      )}
    </section>
  );
}
