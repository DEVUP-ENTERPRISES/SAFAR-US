'use client';

import { Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

// Where each booking status sits on the journey; a step is done once the trip is past it.
const STAGE: Record<string, number> = {
  pending_verification: 1,
  pending_approval: 2,
  pending_payment: 3,
  paid: 4,
  confirmed: 4,
  in_progress: 5,
  completed: 7,
};

const time = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export function TripProgress({
  status,
  pickupAt,
  sharingOpensAt,
  onVerify,
}: {
  status: string;
  pickupAt: string;
  sharingOpensAt?: string | null;
  onVerify: () => void;
}) {
  const stage = STAGE[status];
  if (stage === undefined) return null;

  const opens = sharingOpensAt ? new Date(sharingOpensAt) : null;
  const steps = [
    { title: 'Trip requested', detail: 'Your dates are held and your card is authorised.' },
    { title: 'Verify your identity', detail: 'Photograph your licence and take a selfie. Nothing is charged until this passes, and it must be done a few hours before pickup or the booking is released.' },
    { title: 'Host approval', detail: 'The host reviews and accepts your request.' },
    { title: 'Payment confirmed', detail: 'Your card is charged and the trip is locked in.' },
    {
      title: 'Pickup day',
      detail: `We remind you 24 hours before. ${opens ? `Live location sharing opens around ${time(opens)}. ` : ''}At the car, open “Your pickup code” below and show it to your host.`,
    },
    { title: 'On the road', detail: 'Enjoy the drive. Location sharing is off while you’re out.' },
    { title: 'Return & close out', detail: 'Return on time with photos; your deposit is released after the host’s inspection window.' },
  ];
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
