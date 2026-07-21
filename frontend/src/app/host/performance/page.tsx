'use client';

import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Gauge, CheckCircle2, Car } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat-tile';
import { BarChart, Donut } from '@/components/ui/charts';
import { formatMoney } from '@/lib/utils/format';
import { hostApi } from '@/features/host/api';

const monthLabel = (m: string) => {
  const mm = Number(m.split('-')[1]);
  return ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][mm] ?? m;
};

export default function HostPerformancePage() {
  const { data, isLoading } = useQuery({ queryKey: ['host-performance'], queryFn: () => hostApi.performance() });

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  const cur = data.currency;
  const m = (v: number) => formatMoney({ amount: v, currency: cur });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Host"
        title="Performance"
        description="How your fleet is doing — earnings trend, how full your cars are, and which ones earn the most."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile
          tone={data.occupancyPct >= 70 ? 'success' : data.occupancyPct >= 40 ? 'warning' : 'default'}
          icon={<Gauge className="h-5 w-5" />}
          label="Occupancy (next 30 days)"
          value={`${data.occupancyPct}%`}
          sub="Booked vehicle-days"
        />
        <StatTile
          tone="primary"
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Acceptance rate"
          value={`${data.acceptanceRate}%`}
          sub={`${data.completedTrips} completed · ${data.cancelledByHost} declined`}
        />
        <StatTile
          icon={<Car className="h-5 w-5" />}
          label="Active vehicles"
          value={data.perVehicle.length}
          sub="Earning on the platform"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> Earnings trend</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart data={data.earningsByMonth.map((d) => ({ label: monthLabel(d.month), value: d.amount }))} currency={cur} />
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-soft">
          <CardHeader><CardTitle>Revenue by vehicle</CardTitle></CardHeader>
          <CardContent>
            {data.perVehicle.length ? (
              <Donut data={data.perVehicle.slice(0, 5).map((v) => ({ label: v.label, value: v.revenue }))} currency={cur} />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No trips yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Per-vehicle table */}
      <Card className="rounded-2xl shadow-soft">
        <CardHeader><CardTitle>Per-vehicle breakdown</CardTitle></CardHeader>
        <CardContent>
          {data.perVehicle.length === 0 ? (
            <EmptyState icon={<Car className="h-10 w-10" />} title="No revenue yet" description="Complete a trip to see per-vehicle numbers." />
          ) : (
            <div className="divide-y divide-border">
              {data.perVehicle.map((v) => (
                <div key={v.vehicleId} className="flex items-center justify-between py-3 text-sm">
                  <span className="font-medium">{v.label}</span>
                  <span className="flex items-center gap-6">
                    <span className="text-muted-foreground">{v.trips} trip{v.trips === 1 ? '' : 's'}</span>
                    <span className="w-24 text-right font-semibold tabular-nums">{m(v.revenue)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
