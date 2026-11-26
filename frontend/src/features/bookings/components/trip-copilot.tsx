'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Info, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils/cn';
import { bookingApi, type NextStep } from '@/features/bookings/api';

const TONE: Record<NextStep['tone'], { icon: typeof Info; card: string; icon_: string }> = {
  action: { icon: Sparkles, card: 'border-primary/40', icon_: 'text-primary' },
  waiting: { icon: Clock, card: '', icon_: 'text-muted-foreground' },
  info: { icon: Info, card: '', icon_: 'text-primary' },
  warning: { icon: AlertTriangle, card: 'border-warning/50 bg-warning/5', icon_: 'text-warning' },
  success: { icon: CheckCircle2, card: 'border-success/40', icon_: 'text-success' },
};

// "in 2 h 15 min" / "in 3 days" / "15 min ago", ticking every 30 s.
function useCountdown(dueIso?: string): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!dueIso) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [dueIso]);
  if (!dueIso) return null;
  const diff = new Date(dueIso).getTime() - now;
  const mins = Math.round(Math.abs(diff) / 60_000);
  const text = mins >= 2880 ? `${Math.round(mins / 1440)} days` : mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

/** The one card that always says what to do next on this booking. */
export function TripCopilot({ bookingId }: { bookingId: string }) {
  const q = useQuery({
    queryKey: ['next-step', bookingId],
    queryFn: () => bookingApi.nextStep(bookingId),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const countdown = useCountdown(q.data?.dueAt);

  if (q.isLoading) return <Skeleton className="h-36 w-full" />;
  if (q.isError || !q.data) return null;

  const s = q.data;
  const tone = TONE[s.tone];
  const Icon = tone.icon;

  return (
    <Card className={tone.card}>
      <CardContent className="space-y-4 py-5">
        <div className="flex items-start gap-3">
          <Icon className={cn('mt-0.5 h-6 w-6 shrink-0', tone.icon_)} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next step</p>
            <p className="font-display text-xl font-bold">{s.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
            {countdown && (
              <p className={cn('mt-2 inline-flex items-center gap-1.5 text-sm font-medium tabular-nums', s.tone === 'warning' ? 'text-warning' : 'text-foreground')}>
                <Clock className="h-4 w-4" aria-hidden /> {countdown.endsWith('ago') ? `Was due ${countdown}` : `Due ${countdown}`}
              </p>
            )}
          </div>
        </div>

        {s.action && (
          <Link
            href={s.action.href}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
          >
            {s.action.label} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        )}

        <ol className="grid grid-cols-5 gap-1.5" aria-label="Trip progress">
          {s.steps.map((step) => (
            <li key={step.label} className="min-w-0">
              <div className={cn('h-1.5 rounded-full', step.done ? 'bg-primary' : step.current ? 'bg-primary/40' : 'bg-muted')} />
              <p className={cn('mt-1.5 truncate text-xs', step.done || step.current ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                {step.label}
                {step.current && <span className="sr-only"> (current)</span>}
              </p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
