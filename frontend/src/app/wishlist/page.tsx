'use client';

import Link from 'next/link';
import { Heart } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { VehicleCard } from '@/features/vehicles/components/vehicle-card';
import { useFavorites } from '@/features/favorites/hooks';

function Saved() {
  const { data, isLoading } = useFavorites();

  if (isLoading)
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-72 w-full" />
        ))}
      </div>
    );

  if (!data || data.length === 0)
    return (
      <EmptyState
        title="No saved cars yet"
        description="Tap the heart on any car to save it here."
        icon={<Heart className="h-10 w-10" />}
        action={
          <Link href="/search">
            <Button>Explore cars</Button>
          </Link>
        }
      />
    );

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {data.map((v) => (
        <VehicleCard key={v._id} vehicle={v} />
      ))}
    </div>
  );
}

export default function WishlistPage() {
  return (
    <AuthGuard>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Saved cars</h1>
        <Saved />
      </div>
    </AuthGuard>
  );
}
