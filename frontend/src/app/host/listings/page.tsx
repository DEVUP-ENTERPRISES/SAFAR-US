'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { formatMoney } from '@/lib/utils/format';
import { useMyVehicles } from '@/features/vehicles/hooks';

export default function ListingsPage() {
  const { data, isLoading } = useMyVehicles(true);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Listings</h1>
        <Link href="/host/listings/new">
          <Button>
            <Plus className="h-4 w-4" /> Add vehicle
          </Button>
        </Link>
      </div>

      {isLoading && <Skeleton className="h-40 w-full" />}
      {data && data.length === 0 && (
        <EmptyState title="No listings yet" description="Add your first vehicle to start earning." />
      )}
      {data && data.length > 0 && (
        <div className="space-y-3">
          {data.map((v) => (
            <Link key={v._id} href={`/host/listings/${v._id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                  <div className="flex items-center gap-4">
                    {v.photos?.[0]?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.photos[0].url} alt="" className="h-14 w-20 rounded-md object-cover" />
                    ) : (
                      <div className="flex h-14 w-20 items-center justify-center rounded-md bg-muted text-sm font-bold text-muted-foreground">
                        {v.make.slice(0, 1)}
                        {v.model.slice(0, 1)}
                      </div>
                    )}
                    <div>
                      <p className="font-medium">
                        {v.make} {v.model} · {v.year}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatMoney({ amount: v.pricing.dailyPrice, currency: v.pricing.currency })}/day ·{' '}
                        {v.location.city}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={v.verificationStatus === 'verified' ? 'success' : 'muted'}>
                      {v.verificationStatus}
                    </Badge>
                    <Badge tone={v.status === 'listed' ? 'success' : 'warning'}>{v.status}</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
