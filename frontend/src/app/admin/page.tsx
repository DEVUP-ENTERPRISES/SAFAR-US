'use client';

import { Users, BadgeCheck, Car, ShieldAlert, LifeBuoy, TrendingUp, Wallet } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat-tile';
import { BarChart } from '@/components/ui/charts';
import { formatMoney } from '@/lib/utils/format';
import { adminApi } from '@/features/admin/api';
import { adminPath } from '@/lib/admin-path';

export default function AdminDashboard() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-metrics'], queryFn: () => adminApi.metrics(), refetchInterval: 30_000 });
  const analytics = useQuery({ queryKey: ['admin-analytics'], queryFn: () => adminApi.analytics(14) });

  if (isLoading || !data)
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-2xl" />)}
        </div>
      </div>
    );

  const cur = data.revenue.currency;
  const queue =
    data.hosts.pending + data.vehicles.pendingVerification + data.claims.open + data.tickets.open;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin"
        title="Platform overview"
        description={
          queue > 0
            ? `${queue} item${queue === 1 ? '' : 's'} need your attention. Metrics refresh automatically.`
            : 'All queues clear. Metrics refresh automatically.'
        }
      />

      {/* Business health */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Business</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile tone="primary" icon={<TrendingUp className="h-5 w-5" />} label="GMV" value={formatMoney({ amount: data.bookings.gmv, currency: cur })} sub={`${data.bookings.total} bookings`} />
          <StatTile tone="primary" icon={<Wallet className="h-5 w-5" />} label="Platform revenue" value={formatMoney({ amount: data.revenue.platform, currency: cur })} sub="Commission + protection" />
          <StatTile icon={<Users className="h-5 w-5" />} label="Users" value={data.users.total.toLocaleString()} href={adminPath('users')} sub={`+${data.users.newThisWeek} this week`} />
          <StatTile icon={<Car className="h-5 w-5" />} label="Vehicles listed" value={data.vehicles.listed.toLocaleString()} href={adminPath('vehicles')} sub={`${data.vehicles.pendingVerification} pending verification`} />
        </div>
      </section>

      {/* Action queues — emphasised when non-zero so work never hides. */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Action queues</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile tone={data.hosts.pending ? 'warning' : 'default'} emphasis={data.hosts.pending > 0} icon={<BadgeCheck className="h-5 w-5" />} label="Hosts pending" value={data.hosts.pending} href={adminPath('hosts?status=pending')} />
          <StatTile tone={data.vehicles.pendingVerification ? 'warning' : 'default'} emphasis={data.vehicles.pendingVerification > 0} icon={<Car className="h-5 w-5" />} label="Vehicles to verify" value={data.vehicles.pendingVerification} href={adminPath('vehicles?verification=pending')} />
          <StatTile tone={data.claims.open ? 'destructive' : 'default'} emphasis={data.claims.open > 0} icon={<ShieldAlert className="h-5 w-5" />} label="Open claims" value={data.claims.open} href={adminPath('claims')} />
          <StatTile tone={data.tickets.open ? 'destructive' : 'default'} emphasis={data.tickets.open > 0} icon={<LifeBuoy className="h-5 w-5" />} label="Open tickets" value={data.tickets.open} href={adminPath('support')} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="rounded-2xl shadow-soft lg:col-span-2">
          <CardHeader>
            <CardTitle>Bookings — last 14 days</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={(analytics.data?.series ?? []).map((d) => ({ label: d.day.slice(5), value: d.bookings }))}
              height={180}
            />
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-soft">
          <CardHeader>
            <CardTitle>Bookings by status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.bookings.byStatus.length === 0 && (
              <p className="text-sm text-muted-foreground">No bookings yet.</p>
            )}
            {[...data.bookings.byStatus]
              .sort((a, b) => b.count - a.count)
              .map((s) => {
                const pct = data.bookings.total ? Math.round((s.count / data.bookings.total) * 100) : 0;
                return (
                  <div key={s.status} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="capitalize">{s.status.replace(/_/g, ' ')}</span>
                      <span className="font-medium tabular-nums">{s.count}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
