'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { cn } from '@/lib/utils/cn';
import { useMyVehicles } from '@/features/vehicles/hooks';
import { hostTripsApi, type HostTrip } from '@/features/host/trips.api';

const DAYS = 14; // a fortnight fits on screen and covers the booking horizon

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
const key = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Fleet calendar: vehicles down, days across. Each cell shows what that car
 * actually earns that day (its real daily rate, weekend multiplier applied) and
 * a bar spans the days it is already booked - so a host can see, in one glance,
 * which cars are sitting idle and what they'd earn if they weren't.
 */
export function HostCalendar() {
  const [offset, setOffset] = useState(0);
  const vehicles = useMyVehicles(true);
  const booked = useQuery({ queryKey: ['host-trips', 'booked'], queryFn: () => hostTripsApi.booked() });

  const start = useMemo(() => addDays(new Date(), offset * DAYS), [offset]);
  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDays(start, i)), [start]);

  if (vehicles.isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (!vehicles.data || vehicles.data.length === 0) {
    return <EmptyState title="No vehicles" description="List a car to see its calendar." />;
  }

  // Which booking covers each vehicle's day, so a cell can name it and open it.
  const spans = new Map<string, { from: string; to: string; trip: HostTrip }[]>();
  for (const t of booked.data ?? []) {
    const list = spans.get(t.vehicle._id) ?? [];
    list.push({ from: key(new Date(t.period.start)), to: key(new Date(t.period.end)), trip: t });
    spans.set(t.vehicle._id, list);
  }
  const bookingOn = (vid: string, d: Date) => {
    const k = key(d);
    return (spans.get(vid) ?? []).find((s) => k >= s.from && k <= s.to);
  };

  return (
    <div className="space-y-3">
      {/* Range nav */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">
          {start.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} –{' '}
          {addDays(start, DAYS - 1).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </p>
        <div className="flex gap-1">
          <button
            onClick={() => setOffset((o) => o - 1)}
            className="rounded-lg border border-border p-1.5 transition-colors hover:bg-accent"
            aria-label="Previous fortnight"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setOffset((o) => o + 1)}
            className="rounded-lg border border-border p-1.5 transition-colors hover:bg-accent"
            aria-label="Next fortnight"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="sticky start-0 z-10 w-40 bg-card p-3 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Vehicle
              </th>
              {days.map((d) => {
                const weekend = d.getDay() === 0 || d.getDay() === 6;
                const today = key(d) === key(new Date());
                return (
                  <th key={key(d)} className={cn('min-w-[4.5rem] p-2 text-center', weekend && 'bg-muted/40')}>
                    <div className="text-[10px] font-medium uppercase text-muted-foreground">
                      {d.toLocaleDateString(undefined, { weekday: 'short' })}
                    </div>
                    <div
                      className={cn(
                        'mx-auto mt-0.5 grid h-7 w-7 place-items-center rounded-full text-sm font-semibold',
                        today && 'bg-foreground text-background',
                      )}
                    >
                      {d.getDate()}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {vehicles.data.map((v) => (
              <tr key={v._id} className="border-b border-border last:border-0">
                <td className="sticky start-0 z-10 bg-card p-3">
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-12 shrink-0 overflow-hidden rounded bg-muted">
                      {v.photos?.[0]?.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.photos[0].url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center brand-gradient text-[10px] font-bold text-white/70">
                          {v.make.slice(0, 1)}
                          {v.model.slice(0, 1)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold">{v.make} {v.model}</p>
                      <p className="truncate font-mono text-[10px] text-muted-foreground">
                        {v.registrationNumber ?? '-'}
                      </p>
                    </div>
                  </div>
                </td>

                {days.map((d) => {
                  const weekend = d.getDay() === 0 || d.getDay() === 6;
                  const span = bookingOn(v._id, d);
                  const request = span?.trip.status === 'pending_approval';
                  const first = !!span && (span.from === key(d) || key(d) === key(days[0]));
                  // The real rate the guest would pay that day, weekend multiplier included.
                  const rate = Math.round(
                    (v.pricing.dailyPrice * (weekend ? v.pricing.weekendMultiplierBps ?? 10000 : 10000)) / 10000,
                  );
                  return (
                    <td
                      key={key(d)}
                      className={cn(
                        'relative h-14 border-s border-border text-center align-middle',
                        weekend && 'bg-muted/40',
                        span && (request ? 'bg-warning/15' : 'bg-primary/10'),
                      )}
                    >
                      {span ? (
                        <Link
                          href={`/host/trips/${span.trip.bookingId}`}
                          title={`${request ? 'Request' : 'Booked'} · ${span.trip.guest.name} · ${span.trip.code}`}
                          className="absolute inset-0 flex flex-col justify-center gap-1 px-1 hover:bg-foreground/5"
                        >
                          <span className={cn('block h-1.5 w-full rounded-full', request ? 'bg-warning' : 'bg-primary')} />
                          {first && (
                            <span className="truncate text-[10px] font-semibold">
                              {request ? 'Request' : span.trip.guest.name.split(' ')[0]}
                            </span>
                          )}
                        </Link>
                      ) : (
                        <span className="text-xs font-semibold tabular-nums">
                          ${(rate / 100).toFixed(0)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        <span className="me-1 inline-block h-1.5 w-4 rounded-full bg-primary align-middle" /> booked ·{' '}
        <span className="me-1 inline-block h-1.5 w-4 rounded-full bg-warning align-middle" /> request waiting for you · tap a booked day to open it ·
        prices shown are what a guest pays that day (weekend rates included).
      </p>
    </div>
  );
}
