'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, TrendingUp, CalendarCheck, Star, ShieldAlert, FileWarning, ChevronRight, AlertTriangle,
} from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { cn } from '@/lib/utils/cn';
import { formatDate } from '@/lib/utils/format';
import { vehicleApi, type VehicleInsights } from '@/features/vehicles/api';

const money = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });

function Insights({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['vehicle-insights', id], queryFn: () => vehicleApi.insights(id), retry: false });

  if (q.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (q.isError || !q.data) return <ErrorState message="We couldn’t load this car’s numbers." />;

  const d = q.data;
  const v = d.vehicle;
  const expiring = d.documents.filter((x) => x.expiringSoon);

  return (
    <div className="space-y-6">
      <Link href={`/host/listings/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to listing
      </Link>

      <div>
        <h1 className="display text-display-sm">{v.year} {v.make} {v.model}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={v.status === 'listed' ? 'success' : 'muted'}>{v.status}</Badge>
          <Badge tone={v.verificationStatus === 'verified' ? 'success' : 'warning'}>{v.verificationStatus}</Badge>
          {v.ratingCount > 0 && (
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <Star className="h-3.5 w-3.5 fill-current text-foreground" /> {v.ratingAvg.toFixed(1)} ({v.ratingCount})
            </span>
          )}
        </div>
      </div>

      {/* Anything that will take the car off the market comes first. */}
      {expiring.length > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="font-semibold">Paperwork expiring</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {expiring.map((x) => `${x.category}${x.expiresAt ? ` (${formatDate(x.expiresAt)})` : ''}`).join(', ')} —
                {' '}this car is unlisted automatically when it lapses.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* The verdict on the asset, in four numbers. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Earned lifetime" value={money(d.earnings.lifetime)} sub={`${money(d.earnings.averagePerTrip)} per trip`} icon={TrendingUp} />
        <Stat label="Last 30 days" value={money(d.earnings.last30d)} sub={`${d.utilisation.completedTrips} trips all-time`} icon={TrendingUp} />
        <Stat
          label="Occupancy"
          value={`${d.utilisation.occupancyPct}%`}
          sub={`${d.utilisation.daysRented90d} of the last 90 days`}
          icon={CalendarCheck}
        />
        <Stat
          label="Claims"
          value={String(d.claims.total)}
          sub={d.claims.costToDate > 0 ? `${money(d.claims.costToDate)} paid out` : 'None settled'}
          icon={ShieldAlert}
          tone={d.claims.open > 0 ? 'warning' : undefined}
        />
      </div>

      {/* Income shape over time. A bar chart is honest here: months are discrete
          buckets, and the comparison that matters is one month against another. */}
      <Card>
        <CardContent className="py-5">
          <p className="font-semibold">Monthly earnings</p>
          {d.earnings.byMonth.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No completed trips yet.</p>
          ) : (
            <MonthlyBars data={d.earnings.byMonth} />
          )}
        </CardContent>
      </Card>

      {/* Upcoming */}
      <Card>
        <CardContent className="py-5">
          <p className="font-semibold">Upcoming trips</p>
          {d.upcoming.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nothing booked. Check your pricing and availability.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {d.upcoming.map((t) => (
                <li key={t.bookingId}>
                  <Link href={`/host/trips/${t.bookingId}`} className="flex items-center justify-between gap-3 py-3 hover:text-primary">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{t.code}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(t.start)} → {formatDate(t.end)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Badge tone={t.status === 'pending_approval' ? 'warning' : 'success'}>
                        {t.status === 'pending_approval' ? 'Awaiting you' : 'Confirmed'}
                      </Badge>
                      <span className="text-sm font-semibold tabular-nums">{money(t.earnings)}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Reviews */}
      <Card>
        <CardContent className="py-5">
          <p className="font-semibold">What guests said</p>
          {d.reviews.recent.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No reviews yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {d.reviews.recent.map((r, i) => (
                <li key={i} className="border-l-2 border-border pl-3">
                  <div className="flex items-center gap-1 text-sm font-semibold">
                    {r.rating.toFixed(1)} <Star className="h-3.5 w-3.5 fill-current" />
                    <span className="ml-1 font-normal text-muted-foreground">{formatDate(r.createdAt)}</span>
                  </div>
                  {r.comment && <p className="mt-0.5 text-sm text-muted-foreground">{r.comment}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Documents */}
      <Card>
        <CardContent className="py-5">
          <p className="font-semibold">Documents</p>
          {d.documents.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No documents uploaded.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {d.documents.map((doc, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="flex items-center gap-2 capitalize">
                    {doc.expiringSoon && <FileWarning className="h-4 w-4 text-warning" />}
                    {doc.category}
                  </span>
                  <span className="flex items-center gap-3">
                    {doc.expiresAt && (
                      <span className={cn('text-xs', doc.expiringSoon ? 'font-medium text-warning' : 'text-muted-foreground')}>
                        expires {formatDate(doc.expiresAt)}
                      </span>
                    )}
                    <Badge tone={doc.status === 'approved' ? 'success' : 'warning'}>{doc.status}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label, value, sub, icon: Icon, tone,
}: {
  label: string; value: string; sub?: string;
  icon: typeof TrendingUp; tone?: 'warning';
}) {
  return (
    <Card className={cn(tone === 'warning' && 'border-warning/40')}>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <p className="mt-1.5 text-2xl font-bold tabular-nums">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function MonthlyBars({ data }: { data: VehicleInsights['earnings']['byMonth'] }) {
  const max = Math.max(...data.map((d) => d.amount), 1);
  // Last 12 months is as far back as a pricing decision usefully looks.
  const shown = data.slice(-12);

  return (
    <div className="mt-4 flex items-end gap-2" style={{ height: 140 }}>
      {shown.map((m) => (
        <div key={m.month} className="group flex flex-1 flex-col items-center gap-1.5">
          <span className="text-[10px] font-medium tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
            {money(m.amount)}
          </span>
          <div
            className="w-full rounded-t bg-primary/80 transition-colors group-hover:bg-primary"
            style={{ height: `${Math.max(4, (m.amount / max) * 100)}%` }}
            title={`${monthLabel(m.month)} — ${money(m.amount)} across ${m.trips} trip${m.trips === 1 ? '' : 's'}`}
          />
          <span className="text-[10px] text-muted-foreground">{monthLabel(m.month)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGuard loginPath="/host/login">
      <Insights id={id} />
    </AuthGuard>
  );
}
