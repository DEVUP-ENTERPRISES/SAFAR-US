'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Users, Receipt, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat-tile';
import { BarChart, LineChart, Donut } from '@/components/ui/charts';
import { formatMoney } from '@/lib/utils/format';
import { adminApi } from '@/features/admin/api';

const WINDOWS = [7, 14, 30, 90];

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** Horizontal ranked bars — better than a pie for "which city is biggest". */
function Ranked({
  rows,
  currency,
}: {
  rows: { key: string; trips: number; gmv: number }[];
  currency: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No trips in this window.</p>;
  const max = Math.max(...rows.map((r) => r.trips));
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.key} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate capitalize">{r.key}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {r.trips} · {formatMoney({ amount: r.gmv, currency })}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/70"
              style={{ width: `${max > 0 ? (r.trips / max) * 100 : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-analytics', days],
    queryFn: () => adminApi.analytics(days),
    refetchInterval: 60_000,
  });

  const cur = data?.currency ?? 'USD';

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Overview"
        title="Analytics"
        description="Demand, revenue and conversion across the marketplace. Aggregated live from bookings, listings and signups — nothing is precomputed."
        actions={
          <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
            {WINDOWS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  d === days ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        }
      />

      {isLoading || !data ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-2xl" />)}
          </div>
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              tone="primary"
              icon={<TrendingUp className="h-5 w-5" />}
              label={`GMV · last ${data.days}d`}
              value={formatMoney({ amount: data.totals.gmv, currency: cur })}
              sub={`${data.totals.bookings} booking${data.totals.bookings === 1 ? '' : 's'}`}
            />
            <StatTile
              icon={<Receipt className="h-5 w-5" />}
              label="Average booking value"
              value={formatMoney({ amount: data.totals.aov, currency: cur })}
              sub="GMV ÷ bookings in window"
            />
            <StatTile
              icon={<Users className="h-5 w-5" />}
              label="New users"
              value={data.totals.signups.toLocaleString()}
              sub={`Signups in the last ${data.days} days`}
            />
            <StatTile
              tone={data.totals.cancellationRate > 0.2 ? 'warning' : 'success'}
              icon={<CheckCircle2 className="h-5 w-5" />}
              label="Completion rate"
              value={pct(data.totals.completionRate)}
              sub={`${pct(data.totals.cancellationRate)} cancelled (all time)`}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="rounded-2xl shadow-soft">
              <CardHeader><CardTitle>Bookings per day</CardTitle></CardHeader>
              <CardContent>
                <BarChart
                  data={data.series.map((d) => ({ label: d.day.slice(5), value: d.bookings }))}
                  height={200}
                />
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-soft">
              <CardHeader><CardTitle>GMV per day</CardTitle></CardHeader>
              <CardContent>
                <LineChart
                  data={data.series.map((d) => ({ label: d.day.slice(5), value: d.gmv }))}
                  currency={cur}
                  height={200}
                />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="rounded-2xl shadow-soft">
              <CardHeader><CardTitle>Top cities</CardTitle></CardHeader>
              <CardContent><Ranked rows={data.cities} currency={cur} /></CardContent>
            </Card>

            <Card className="rounded-2xl shadow-soft">
              <CardHeader><CardTitle>Top categories</CardTitle></CardHeader>
              <CardContent><Ranked rows={data.categories} currency={cur} /></CardContent>
            </Card>

            <Card className="rounded-2xl shadow-soft">
              <CardHeader><CardTitle>Booking outcomes</CardTitle></CardHeader>
              <CardContent className="flex justify-center">
                {data.byStatus.length === 0 ? (
                  <EmptyState title="No bookings yet" description="Outcomes appear once trips are booked." />
                ) : (
                  <Donut
                    data={[...data.byStatus]
                      .sort((a, b) => b.count - a.count)
                      .map((s) => ({ label: s.status.replace(/_/g, ' '), value: s.count }))}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-2xl shadow-soft">
            <CardHeader><CardTitle>New users per day</CardTitle></CardHeader>
            <CardContent>
              <LineChart
                data={data.signups.map((d) => ({ label: d.day.slice(5), value: d.signups }))}
                height={180}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
