'use client';

import { useEffect, useState } from 'react';
import { Car, CheckCircle2, MapPin, MessageSquare, Phone } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';
import type { ApproachState } from '@/features/trips/api';

const ACTION = 'inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-sm border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none';

const STEPS = [
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'on_way', label: 'On the way' },
  { key: 'arriving', label: 'Almost there' },
  { key: 'arrived', label: 'Here' },
] as const;

const clock = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null;

// Minutes left, ticking on the screen between server updates.
function useMinutesLeft(etaIso?: string): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!etaIso) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [etaIso]);
  if (!etaIso) return null;
  return Math.max(0, Math.round((new Date(etaIso).getTime() - now) / 60_000));
}

/** The guest's view of a delivered car coming to them: countdown, progress, the car and who is driving it. */
export function DeliveryTracker({ data, bookingId }: { data: ApproachState; bookingId: string }) {
  const stage = data.stage ?? 'confirmed';
  const minutes = useMinutesLeft(data.host.etaAt);
  if (stage === 'handed_over') return null;

  const at = STEPS.findIndex((s) => s.key === stage);
  const headline =
    stage === 'arrived'
      ? 'Your car is here'
      : stage === 'confirmed'
        ? 'Getting your car ready'
        : minutes === null
          ? 'Your car is on the way'
          : minutes <= 1
            ? 'Arriving now'
            : `Arriving in ${minutes} min`;
  const sub =
    stage === 'arrived'
      ? `Arrived at ${clock(data.host.arrivedAt)}. Meet your driver and have your pickup code ready.`
      : stage === 'confirmed'
        ? 'We’ll tell you the moment it leaves.'
        : data.host.etaAt
          ? `Expected around ${clock(data.host.etaAt)}. We’ll tell you if that changes.`
          : 'Working out the arrival time.';

  return (
    <Card className="overflow-hidden border-primary/30">
      <CardContent className="space-y-5 py-5">
        <div className="flex items-start gap-3">
          {stage === 'arrived' ? (
            <CheckCircle2 className="mt-1 h-6 w-6 shrink-0 text-success" />
          ) : (
            <Car className={cn('mt-1 h-6 w-6 shrink-0 text-primary', stage !== 'confirmed' && 'motion-safe:animate-pulse')} />
          )}
          <div className="min-w-0">
            <p className="font-display text-2xl font-bold tabular-nums" aria-live="polite">{headline}</p>
            <p className="mt-1 text-sm text-muted-foreground">{sub}</p>
          </div>
        </div>

        <ol className="grid grid-cols-4 gap-2" aria-label="Delivery progress">
          {STEPS.map((s, i) => (
            <li key={s.key} className="min-w-0">
              <div className={cn('h-1.5 rounded-full', i <= at ? 'bg-primary' : 'bg-muted')} />
              <p className={cn('mt-1.5 truncate text-xs', i <= at ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                {s.label}
                {i === at && <span className="sr-only"> (current)</span>}
              </p>
            </li>
          ))}
        </ol>

        {data.car && (
          <div className="flex items-center gap-3 rounded-lg border border-border p-3">
            {data.car.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.car.photoUrl} alt="" width={64} height={48} className="h-12 w-16 shrink-0 rounded-sm object-cover" />
            ) : (
              <div className="grid h-12 w-16 shrink-0 place-items-center rounded-sm bg-muted"><Car className="h-5 w-5 text-muted-foreground" /></div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{data.car.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[data.car.color, data.car.plate && `Plate ${data.car.plate}`].filter(Boolean).join(' · ') || 'Your car'}
              </p>
            </div>
          </div>
        )}

        {data.driver && (
          <div className="flex flex-wrap items-center gap-3">
            {data.driver.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.driver.avatarUrl} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {data.driver.name.charAt(0).toUpperCase()}
              </span>
            )}
            <p className="min-w-0 flex-1 text-sm">
              <span className="font-semibold">{data.driver.name}</span>
              <span className="text-muted-foreground"> is bringing your car</span>
            </p>
            <div className="flex w-full gap-2 sm:w-auto">
              {data.driver.phone && (
                <a href={`tel:${data.driver.phone}`} className={ACTION}>
                  <Phone className="h-4 w-4" /> Call
                </a>
              )}
              <a href={`/bookings/${bookingId}#chat`} className={ACTION}>
                <MessageSquare className="h-4 w-4" /> Message
              </a>
            </div>
          </div>
        )}

        {data.destination?.label && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Delivering to {data.destination.label}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
