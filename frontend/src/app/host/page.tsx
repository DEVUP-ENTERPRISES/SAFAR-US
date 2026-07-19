'use client';

import Link from 'next/link';
import { Plus, Car, Wallet, TrendingUp, Star, Award } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat-tile';
import { EmptyState } from '@/components/ui/states';
import { formatMoney } from '@/lib/utils/format';
import { useHostMe, useEarnings } from '@/features/host/hooks';
import { useMyVehicles } from '@/features/vehicles/hooks';

export default function HostDashboardPage() {
  const host = useHostMe();
  const earnings = useEarnings();
  const vehicles = useMyVehicles(true);
  const cur = earnings.data?.currency ?? 'USD';
  const money = (v: number) => formatMoney({ amount: v, currency: cur });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Host"
        title={host.data?.displayName ?? 'Host dashboard'}
        description="Your listings, earnings and trip activity at a glance."
        actions={
          <>
            {host.data && (
              <Badge tone={host.data.verificationStatus === 'verified' ? 'success' : 'warning'}>
                {host.data.verificationStatus}
              </Badge>
            )}
            {host.data?.isSuperhost && (
              <Badge tone="default">
                <Award className="mr-1 h-3 w-3" /> Superhost
              </Badge>
            )}
            <Link href="/host/listings/new">
              <Button>
                <Plus className="h-4 w-4" /> Add vehicle
              </Button>
            </Link>
          </>
        }
      />

      {earnings.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            tone="primary"
            icon={<TrendingUp className="h-5 w-5" />}
            label="Lifetime earnings"
            value={money(earnings.data?.lifetimeEarnings ?? 0)}
            href="/host/earnings"
          />
          <StatTile
            tone="success"
            icon={<Wallet className="h-5 w-5" />}
            label="Available balance"
            value={money(earnings.data?.currentBalance ?? 0)}
            href="/host/earnings"
          />
          <StatTile
            icon={<Car className="h-5 w-5" />}
            label="Completed trips"
            value={earnings.data?.completedTrips ?? 0}
          />
          <StatTile
            icon={<Star className="h-5 w-5" />}
            label="Rating"
            value={host.data?.ratingAvg ? host.data.ratingAvg.toFixed(1) : '—'}
            sub={host.data?.totalTrips ? `${host.data.totalTrips} trips hosted` : 'No trips yet'}
          />
        </div>
      )}

      {/* Listings */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your listings</h2>
          {vehicles.data && vehicles.data.length > 0 && (
            <Link href="/host/listings" className="text-sm font-medium text-primary hover:underline">
              View all →
            </Link>
          )}
        </div>

        {vehicles.isLoading && <Skeleton className="h-32 w-full rounded-2xl" />}

        {vehicles.data && vehicles.data.length === 0 && (
          <EmptyState
            icon={<Car className="h-10 w-10" />}
            title="No vehicles yet"
            description="List your first car to start earning."
            action={
              <Link href="/host/listings/new">
                <Button>
                  <Plus className="h-4 w-4" /> Add vehicle
                </Button>
              </Link>
            }
          />
        )}

        {vehicles.data && vehicles.data.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.data.slice(0, 6).map((v) => (
              <Link key={v._id} href={`/host/listings/${v._id}`} className="group block">
                <Card className="rounded-[2rem] shadow-[0_4px_24px_-8px_rgba(0,0,0,0.06)] transition-all duration-300 group-hover:-translate-y-1 group-hover:border-primary/40 group-hover:shadow-[0_12px_48px_-12px_rgba(0,0,0,0.12)]">
                  <CardContent className="flex items-center justify-between gap-4 p-6">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-bold tracking-tight transition-colors group-hover:text-primary">
                        {v.make} {v.model}
                      </p>
                      <p className="mt-1 text-[15px] font-medium text-muted-foreground">
                        {formatMoney({ amount: v.pricing.dailyPrice, currency: v.pricing.currency })} <span className="text-sm opacity-70">/ day</span>
                      </p>
                    </div>
                    <Badge tone={v.status === 'listed' ? 'success' : 'muted'} className="px-3 py-1 text-xs uppercase tracking-wider">
                      {v.status}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
