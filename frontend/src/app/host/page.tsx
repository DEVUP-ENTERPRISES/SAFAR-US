'use client';

import Link from 'next/link';
import { Plus, Car, Wallet, TrendingUp, Star } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/lib/utils/format';
import { useHostMe, useEarnings } from '@/features/host/hooks';
import { useMyVehicles } from '@/features/vehicles/hooks';

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-6">
        <span className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/10 text-primary">
          {icon}
        </span>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function HostDashboardPage() {
  const host = useHostMe();
  const earnings = useEarnings();
  const vehicles = useMyVehicles(true);
  const cur = earnings.data?.currency ?? 'INR';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{host.data?.displayName}</h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge tone={host.data?.verificationStatus === 'verified' ? 'success' : 'warning'}>
              {host.data?.verificationStatus ?? '—'}
            </Badge>
            <span className="text-sm text-muted-foreground">Host dashboard</span>
          </div>
        </div>
        <Link href="/host/listings/new">
          <Button>
            <Plus className="h-4 w-4" /> Add vehicle
          </Button>
        </Link>
      </div>

      {earnings.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            icon={<TrendingUp className="h-5 w-5" />}
            label="Lifetime earnings"
            value={formatMoney({ amount: earnings.data?.lifetimeEarnings ?? 0, currency: cur })}
          />
          <Stat
            icon={<Wallet className="h-5 w-5" />}
            label="Available balance"
            value={formatMoney({ amount: earnings.data?.currentBalance ?? 0, currency: cur })}
          />
          <Stat icon={<Car className="h-5 w-5" />} label="Completed trips" value={String(earnings.data?.completedTrips ?? 0)} />
          <Stat icon={<Star className="h-5 w-5" />} label="Rating" value={host.data?.ratingAvg ? String(host.data.ratingAvg) : '—'} />
        </div>
      )}

      <div>
        <h2 className="mb-3 font-semibold">Your listings</h2>
        {vehicles.isLoading && <Skeleton className="h-24 w-full" />}
        {vehicles.data && vehicles.data.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-muted-foreground">No vehicles yet. List your first one to start earning.</p>
              <Link href="/host/listings/new">
                <Button>
                  <Plus className="h-4 w-4" /> Add vehicle
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
        {vehicles.data && vehicles.data.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.data.slice(0, 6).map((v) => (
              <Link key={v._id} href={`/host/listings/${v._id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center justify-between pt-6">
                    <div>
                      <p className="font-medium">
                        {v.make} {v.model}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatMoney({ amount: v.pricing.dailyPrice, currency: v.pricing.currency })}/day
                      </p>
                    </div>
                    <Badge tone={v.status === 'listed' ? 'success' : 'muted'}>{v.status}</Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
