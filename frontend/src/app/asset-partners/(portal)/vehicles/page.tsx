'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Car } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat-tile';
import { formatMoney } from '@/lib/utils/format';
import { PartnerVehicleCard } from '@/features/asset-partners/components/vehicle-card';
import { NotAPartner } from '@/features/asset-partners/components/not-a-partner';
import { assetPartnerApi } from '@/features/asset-partners/api';
import { ApiError } from '@/lib/api/types';

/**
 * Every car in the programme, with what each is actually earning.
 *
 * The dashboard shows three; this owns the full list. A fleet partner can hold
 * a dozen cars, and "which of mine is underperforming" is a question the
 * dashboard's preview cannot answer.
 */
export default function PartnerVehiclesPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['asset-partner-vehicles'],
    queryFn: () => assetPartnerApi.vehicles(),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-6 py-8">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  // 403 here means "not in the programme", which is a different answer from a
  // network failure and deserves a route out rather than a retry button.
  if (isError && error instanceof ApiError && error.status === 403) {
    return (
      <div className="py-8">
        <NotAPartner />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="py-8">
        <ErrorState message="We couldn’t load your vehicles." retry={() => refetch()} />
      </div>
    );
  }

  const currency = 'USD';
  const totals = data.reduce(
    (acc, v) => ({ net: acc.net + v.net, gross: acc.gross + v.gross, trips: acc.trips + v.trips }),
    { net: 0, gross: 0, trips: 0 },
  );
  const live = data.filter((v) => v.status === 'listed').length;

  return (
    <div className="space-y-8 py-8">
      <PageHeader
        eyebrow="Asset Partners"
        title="Your vehicles"
        description="Every car in the programme, and what each earned this month."
        actions={
          <Link href="/asset-partners/apply">
            <Button variant="outline">Add another vehicle</Button>
          </Link>
        }
      />

      {data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Car className="h-7 w-7" />
            </span>
            <div>
              <p className="display text-xl">No vehicles yet</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                Once onboarding and the inspection are done, your car goes live here and starts
                earning. We’ll call you to arrange it.
              </p>
            </div>
            <Link href="/asset-partners/dashboard">
              <Button variant="outline">Check your application status</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Vehicles" value={String(data.length)} sub={`${live} live`} />
            <StatTile
              label="Net this month"
              value={formatMoney({ amount: totals.net, currency })}
              sub="After fee, insurance, detailing"
              tone={totals.net >= 0 ? 'success' : 'warning'}
            />
            <StatTile label="Gross this month" value={formatMoney({ amount: totals.gross, currency })} />
            <StatTile label="Trips this month" value={String(totals.trips)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.map((v) => (
              <PartnerVehicleCard key={v._id} vehicle={v} currency={currency} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
