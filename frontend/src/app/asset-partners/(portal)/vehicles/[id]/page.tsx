'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Car, Wrench, Route } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, EmptyState } from '@/components/ui/states';
import { StatTile } from '@/components/ui/stat-tile';
import { BarChart } from '@/components/ui/charts';
import { formatMoney, formatDate } from '@/lib/utils/format';
import { assetPartnerApi } from '@/features/asset-partners/api';

/**
 * One car: what it earns, what it has been doing, and what has been done to it.
 *
 * A partner with several vehicles needs to compare them, and "why did this one
 * earn less" is answerable only per-car — the statement rolls everything up.
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
        <Skeleton className="h-52 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="py-8">
        <ErrorState message="We couldn’t find that vehicle." retry={() => refetch()} />
        <Link href="/asset-partners/vehicles" className="mt-4 inline-block text-sm font-medium text-primary underline">
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
        href="/asset-partners/vehicles"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Your vehicles
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
              {data.plate && <span className="font-mono text-xs text-muted-foreground">{data.plate}</span>}
            </div>
            <h1 className="display mt-3 truncate text-2xl">
              {data.year} {data.make} {data.model}
              {data.trim ? ` ${data.trim}` : ''}
            </h1>
            {data.vin && (
              <p className="mt-1 break-all text-sm text-muted-foreground">VIN {data.vin}</p>
            )}
            <p className="mt-1 text-sm text-muted-foreground">
              In the programme since {formatDate(data.createdAt)}
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
        <StatTile label="Trips this month" value={String(data.trips)} />
      </div>

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
                    <p className="text-xs text-muted-foreground">{formatDate(m.scheduledFor)}</p>
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
