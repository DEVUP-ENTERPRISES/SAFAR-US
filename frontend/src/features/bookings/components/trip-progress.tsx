'use client';

import { Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { TRIP_STAGE, TRIP_STEPS } from '../status';

// Where each booking status sits on the journey; a step is done once the trip is past it.

export function TripProgress({
  status,
  pickupAt,
  onVerify,
}: {
  status: string;
  pickupAt: string;
  onVerify: () => void;
}) {
  const stage = TRIP_STAGE[status];
  if (stage === undefined) return null;

  const steps = TRIP_STEPS;
  const current = stage >= steps.length ? -1 : stage;

  return (
    <Card>
      <CardContent className="py-5">
        <p className="font-semibold">Your trip, step by step</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Pickup {new Date(pickupAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </p>
        <ol className="mt-4 space-y-0">
          {steps.map((s, i) => {
            const done = i < stage;
            const isCurrent = i === current;
            return (
              <li key={s.title} className="relative flex gap-3 pb-5 last:pb-0">
                {i < steps.length - 1 && (
                  <span className={cn('absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-px', done ? 'bg-primary' : 'bg-border')} />
                )}
                <span
                  className={cn(
                    'relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                    done && 'border-primary bg-primary text-primary-foreground',
                    isCurrent && 'border-primary bg-primary/10 text-primary ring-4 ring-primary/15',
                    !done && !isCurrent && 'border-border text-muted-foreground',
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className={cn('text-sm font-medium', !done && !isCurrent && 'text-muted-foreground')}>{s.title}</p>
                  {(isCurrent || (!done && i === current + 1)) && (
                    <p className="mt-0.5 text-sm text-muted-foreground">{s.detail}</p>
                  )}
                  {isCurrent && i === 1 && (
                    <Button size="sm" className="mt-2" onClick={onVerify}>Verify identity</Button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
