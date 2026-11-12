'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarClock, Car, ExternalLink, Route, Star, Undo2, Wrench } from 'lucide-react';
import { GUEST_SITE } from '@/lib/sites';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, EmptyState } from '@/components/ui/states';
import { StatTile } from '@/components/ui/stat-tile';
import { BarChart } from '@/components/ui/charts';
import { formatMoney, formatDate, formatDay, formatPlate } from '@/lib/utils/format';
import { assetPartnerApi } from '@/features/asset-partners/api';

/**
 * One car: what it earns, what it has been doing, and what has been done to it.
 *
 * A partner with several vehicles needs to compare them, and "why did this one
 * earn less" is answerable only per-car - the statement rolls everything up.
 */
export default function PartnerVehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const currency = 'USD';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['asset-partner-vehicle', id],
    queryFn: () => assetPartnerApi.vehicle(id),
    retry: false,
  });
  const maintenance = useQuery({
    queryKey: ['asset-partner-maintenance'],
    queryFn: () => assetPartnerApi.maintenance(),
  });

  if (isLoading) {
    return (
      <div className="space-y-6 py-8">
        <Skeleton className="h-52 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="py-8">
        <ErrorState message="We couldn’t find that vehicle." retry={() => refetch()} />
        <Link href="/vehicles" className="mt-4 inline-block text-sm font-medium text-primary underline">
          Back to your vehicles
        </Link>
      </div>
    );
  }

  const live = data.status === 'listed';
  const forThisCar = (maintenance.data ?? []).filter((m) => m.vehicleId === id);

  return (
    <div className="space-y-6 py-8">
      <Link
        href="/vehicles"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Your vehicles
      </Link>
      <Link href="/returns" className="float-right inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
        <Undo2 className="h-4 w-4" /> Ask for this car back
      </Link>

      {/* Summary: the car, its state, and this month at a glance. */}
      <Card className="overflow-hidden">
        <div className="grid gap-0 sm:grid-cols-[minmax(0,260px)_1fr]">
          <div className="relative h-44 w-full bg-muted sm:h-full sm:min-h-[200px]">
            {data.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.photo} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-muted-foreground">
                <Car className="h-8 w-8" />
              </div>
            )}
          </div>
          <div className="min-w-0 p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={live ? 'success' : 'muted'}>
                {live ? 'Live' : data.status.replace(/_/g, ' ')}
              </Badge>
              {data.plate && <span className="font-mono text-xs text-muted-foreground">{formatPlate(data.plate)}</span>}
            </div>
            <h1 className="display mt-3 truncate text-2xl">
              {data.year} {data.make} {data.model}
              {data.trim ? ` ${data.trim}` : ''}
            </h1>
            {data.vin && (
              <p className="mt-1 break-all text-sm text-muted-foreground">VIN {data.vin}</p>
            )}
            <p className="mt-1 text-sm text-muted-foreground">
              With CatoDrive since {formatDate(data.createdAt)}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              {data.rating.count > 0 && (
                <span className="inline-flex items-center gap-1 font-medium"><Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden /><span className="tabular-nums">{data.rating.average.toFixed(1)}</span><span className="text-muted-foreground">({data.rating.count} review{data.rating.count === 1 ? '' : 's'})</span></span>
              )}
              {live && (
                <a href={`${GUEST_SITE}/vehicles/${data._id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                  See it as guests do <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              )}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Net this month"
          value={formatMoney({ amount: data.net, currency })}
          sub="After fee, insurance, detailing"
          tone={data.net >= 0 ? 'success' : 'warning'}
        />
        <StatTile label="Gross this month" value={formatMoney({ amount: data.gross, currency })} />
        <StatTile label="Days booked this month" value={`${data.daysBookedThisMonth} / ${data.daysInMonth}`} sub={`${data.trips} trip${data.trips === 1 ? '' : 's'} completed`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarClock className="h-5 w-5 text-primary" /> Coming up
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming trips. We’re adjusting price and listing to fill the calendar.</p>
          ) : (
            <ul className="space-y-3">
              {data.upcoming.map((t) => (
                <li key={t.code} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-0 last:pb-0">
                  <span className="text-sm font-medium">{formatDate(t.start)} → {formatDate(t.end)}</span>
                  {t.now ? <Badge tone="success">Out with a guest now</Badge> : <Badge tone="default">Booked</Badge>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {data.photos.length > 1 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Listing photos</CardTitle></CardHeader>
          <CardContent>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {data.photos.slice(0, 12).map((src) => (
                <li key={src}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" width={160} height={120} loading="lazy" className="aspect-[4/3] w-full rounded-sm object-cover" />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {(data.reviews.length > 0 || data.claims.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
          {data.reviews.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg">What guests say</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.reviews.map((r, i) => (
                  <div key={`${r.at}-${i}`} className="border-b border-border pb-3 text-sm last:border-0 last:pb-0">
                    <p className="flex items-center gap-1 font-medium"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden /><span className="tabular-nums">{r.rating}</span><span className="text-xs font-normal text-muted-foreground">· {formatDate(r.at)}</span></p>
                    {r.comment && <p className="mt-1 text-muted-foreground">{r.comment}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {data.claims.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg">Damage and claims</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.claims.map((c, i) => (
                  <div key={`${c.at}-${i}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 text-sm last:border-0 last:pb-0">
                    <span><span className="font-medium capitalize">{c.type}</span><span className="block text-xs text-muted-foreground">{formatDate(c.at)} · {c.status.replace(/_/g, ' ')}</span></span>
                    <span className="text-end tabular-nums">
                      {typeof c.amountApproved === 'number' ? formatMoney({ amount: c.amountApproved, currency }) : typeof c.amountClaimed === 'number' ? formatMoney({ amount: c.amountClaimed, currency }) : '—'}
                    </span>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">We handle claims with the guest. Your repair cost is capped at your deductible per incident.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {data.monthly.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">This car’s net by month</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={data.monthly.map((m) => ({ label: m.period.slice(5), value: m.net }))}
              currency={currency}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Route className="h-5 w-5 text-primary" /> Recent trips
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentTrips.length === 0 ? (
            <EmptyState title="No trips yet" description="Completed trips on this car will appear here." />
          ) : (
            <div className="space-y-3">
              {data.recentTrips.map((t) => (
                <div
                  key={t.bookingId}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">{t.code}</p>
                    <p className="text-sm font-medium">
                      {formatDate(t.start)} → {formatDate(t.end)}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatMoney({ amount: t.gross, currency })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Wrench className="h-5 w-5 text-primary" /> Maintenance history
          </CardTitle>
        </CardHeader>
        <CardContent>
          {forThisCar.length === 0 ? (
            <EmptyState
              title="Nothing logged"
              description="Servicing and repairs on this car will appear here."
            />
          ) : (
            <div className="space-y-3">
              {forThisCar.map((m) => (
                <div
                  key={m._id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium capitalize">{m.type}</p>
                    <p className="text-xs text-muted-foreground">{formatDay(m.scheduledFor)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {typeof m.cost === 'number' && (
                      <span className="font-medium tabular-nums">
                        {formatMoney({ amount: m.cost, currency })}
                      </span>
                    )}
                    {m.approval === 'pending' && <Badge tone="warning">Needs you</Badge>}
                    {m.approval === 'declined' && <Badge tone="destructive">Declined</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
