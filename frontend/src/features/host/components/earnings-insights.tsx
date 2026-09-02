'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Lightbulb, TrendingUp, CalendarClock, Clock, PieChart } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { BarChart } from '@/components/ui/charts';
import { cn } from '@/lib/utils/cn';
import { hostApi, type VehicleEconomics } from '@/features/host/api';

const money = (c: number) => `$${Math.round(c / 100).toLocaleString('en-US')}`;
const money2 = (c: number) => `$${(c / 100).toFixed(2)}`;

/**
 * Business insight for a host with more than one car.
 *
 * The rest of the earnings page reports totals, which cannot be acted on: a car
 * that earned more may simply have been listed longer. Everything here is a
 * rate, so two cars can be compared honestly, and the ranking is by revenue per
 * available day rather than by revenue — usually a different order, and the
 * order that decides which car to reprice.
 */
export function EarningsInsights() {
  const [days, setDays] = useState(90);
  const q = useQuery({
    queryKey: ['earnings-insights', days],
    queryFn: () => hostApi.earningsInsights(days),
    retry: false,
  });

  if (q.isLoading) return <Skeleton className="h-72 w-full" />;
  if (q.isError || !q.data) return null;

  const d = q.data;
  const earning = d.fleet.filter((f) => f.trips > 0);
  const totalIdle = d.fleet.reduce((s, f) => s + f.idleCostCents, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="display text-xl">Business insight</h2>
        <div className="flex gap-2">
          {[30, 90, 365].map((n) => (
            <Chip key={n} active={days === n} onClick={() => setDays(n)}>
              {n === 365 ? '1 year' : `${n} days`}
            </Chip>
          ))}
        </div>
      </div>

      {/* One sentence, only when the data supports one. */}
      {d.headline && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-start gap-3 py-4">
            <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm font-medium">{d.headline}</p>
          </CardContent>
        </Card>
      )}

      {d.fleet.length === 0 ? (
        <EmptyState title="No cars yet" description="List a car and its economics appear here." />
      ) : (
        <>
          {/* The fleet, ranked by the number that matters. */}
          <Card>
            <CardContent className="py-5">
              <p className="flex items-center gap-2 font-semibold">
                <TrendingUp className="h-4 w-4 text-primary" /> Earnings per available day
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                What each car returns for every day you had it listed — the fair way to compare cars that have
                been on the platform for different lengths of time.
              </p>
              <div className="mt-4 space-y-3">
                {d.fleet.map((f) => (
                  <FleetRow key={f.vehicleId} f={f} best={d.fleet[0].revPerAvailableDayCents} />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* The cost of empty days, named. */}
          {totalIdle > 0 && (
            <Card className="border-warning/40 bg-warning/5">
              <CardContent className="py-5">
                <p className="flex items-center gap-2 font-semibold">
                  <CalendarClock className="h-4 w-4 text-warning" /> Idle days cost you {money(totalIdle)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  That is your own daily rate multiplied by the days each car sat unbooked in this window. It is
                  not a bill — it is what the fleet could have earned at full occupancy, which no fleet reaches.
                  Use it to decide which car to reprice first.
                </p>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Where the guest's money went. */}
            <Card>
              <CardContent className="py-5">
                <p className="flex items-center gap-2 font-semibold">
                  <PieChart className="h-4 w-4 text-primary" /> Where the money went
                </p>
                <dl className="numeric mt-4 space-y-2 text-sm">
                  <Line label="Guests paid (before tax and fees)" value={money(d.split.grossCents)} />
                  <Line label={`Our cut (${d.split.commissionPct}%)`} value={`−${money(d.split.commissionCents)}`} />
                  <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
                    <dt>You earned</dt>
                    <dd>{money(d.split.netCents)}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            {/* Weekday pattern — answers whether the weekend multiplier is right. */}
            <Card>
              <CardContent className="py-5">
                <p className="flex items-center gap-2 font-semibold">
                  <CalendarClock className="h-4 w-4 text-primary" /> Which days trips start
                </p>
                {d.byWeekday.every((w) => w.trips === 0) ? (
                  <p className="mt-2 text-sm text-muted-foreground">No completed trips in this window yet.</p>
                ) : (
                  <>
                    <BarChart
                      className="mt-4"
                      height={150}
                      currency={d.currency}
                      data={d.byWeekday.map((w) => ({ label: w.label.slice(0, 3), value: w.earnedCents }))}
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      If weekends dominate, your weekend multiplier is probably too low.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Lead time — is early-bird or last-minute pricing worth running? */}
          {d.leadTime.length > 0 && (
            <Card>
              <CardContent className="py-5">
                <p className="flex items-center gap-2 font-semibold">
                  <Clock className="h-4 w-4 text-primary" /> How far ahead guests book
                </p>
                <BarChart
                  className="mt-4"
                  height={140}
                  currency={d.currency}
                  data={d.leadTime.map((l) => ({ label: l.bucket, value: l.earnedCents }))}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Mostly last-minute means an early-bird discount is giving away money nobody asked for. Mostly
                  far ahead means the opposite.
                </p>
              </CardContent>
            </Card>
          )}

          {earning.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No completed trips in this window, so the rates above are all zero. They fill in after your first
              trip settles.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function FleetRow({ f, best }: { f: VehicleEconomics; best: number }) {
  const pct = best > 0 ? Math.max(2, Math.round((f.revPerAvailableDayCents / best) * 100)) : 0;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">{f.label}</p>
        <p className="numeric text-sm">
          <span className="font-bold">{money2(f.revPerAvailableDayCents)}</span>
          <span className="text-muted-foreground">/available day</span>
        </p>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', f.trips > 0 ? 'bg-primary' : 'bg-muted-foreground/30')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="numeric mt-1 text-xs text-muted-foreground">
        {f.trips} trip{f.trips === 1 ? '' : 's'} · {f.utilisationPct}% booked · {money(f.earnedCents)} earned over{' '}
        {f.daysAvailable} days listed
      </p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
