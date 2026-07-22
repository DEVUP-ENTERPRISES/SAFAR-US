'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Star, Car } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, EmptyState } from '@/components/ui/states';
import { VehicleCard } from '@/features/vehicles/components/vehicle-card';
import type { Vehicle } from '@/features/vehicles/types';
import {
  useHostPublicProfile, HostAvatar, HostTrustSignals, joinedLabel,
} from '@/features/host/components/host-profile-card';

interface Review {
  _id: string;
  rating: number;
  comment?: string;
  createdAt: string;
  authorName?: string;
}

/**
 * The public host profile. Guests reach it from "Hosted by" on a listing —
 * previously that name wasn't clickable and wasn't even real.
 */
export default function HostProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { data: h, isPending, isError } = useHostPublicProfile(id);

  const reviews = useQuery({
    queryKey: ['reviews', id],
    queryFn: () => api.get<Review[]>('/reviews', { subjectId: id }, false),
    enabled: !!id,
  });

  const vehicles = useQuery({
    queryKey: ['host-vehicles', id],
    queryFn: () => api.get<Vehicle[]>(`/hosts/${id}/vehicles`, undefined, false),
    enabled: !!id,
  });

  if (isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }
  if (isError || !h) return <ErrorState message="This host could not be found." />;

  return (
    <div className="space-y-10">
      {/* Identity */}
      <section className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <HostAvatar profile={h} size={104} />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h1 className="display flex flex-wrap items-center gap-3 text-3xl">
              {h.displayName}
              {h.isSuperhost && (
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-primary">
                  All-Star Host
                </span>
              )}
            </h1>
            <p className="mt-1 text-muted-foreground">Joined {joinedLabel(h.joinedAt)}</p>
          </div>
          <HostTrustSignals profile={h} />
        </div>
      </section>

      {/* Headline numbers — each one omitted rather than faked when absent. */}
      <section className="grid gap-4 sm:grid-cols-3">
        <Card className="rounded-2xl">
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">
              {h.ratingAvg !== null ? h.ratingAvg.toFixed(1) : '—'}
              {h.ratingAvg !== null && <Star className="ml-1 inline h-5 w-5 fill-primary text-primary" />}
            </p>
            <p className="text-sm text-muted-foreground">
              {h.ratingCount > 0 ? `${h.ratingCount} review${h.ratingCount === 1 ? '' : 's'}` : 'No reviews yet'}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{h.totalTrips}</p>
            <p className="text-sm text-muted-foreground">Trip{h.totalTrips === 1 ? '' : 's'} hosted</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{h.listedVehicles}</p>
            <p className="text-sm text-muted-foreground">Car{h.listedVehicles === 1 ? '' : 's'} listed</p>
          </CardContent>
        </Card>
      </section>

      {h.bio && (
        <section>
          <h2 className="mb-3 text-xl font-bold tracking-tight">About {h.displayName}</h2>
          <p className="max-w-2xl leading-relaxed text-muted-foreground">{h.bio}</p>
        </section>
      )}

      {/* Their cars */}
      <section>
        <h2 className="mb-4 text-xl font-bold tracking-tight">
          {h.displayName}&apos;s cars
        </h2>
        {vehicles.isPending ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
          </div>
        ) : vehicles.data && vehicles.data.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.data.map((v) => <VehicleCard key={v._id} vehicle={v} />)}
          </div>
        ) : (
          <EmptyState
            icon={<Car className="h-10 w-10" />}
            title="No cars listed right now"
            description="This host doesn't have any cars available at the moment."
          />
        )}
      </section>

      {/* Reviews */}
      <section>
        <h2 className="mb-4 text-xl font-bold tracking-tight">Reviews</h2>
        {reviews.data && reviews.data.length > 0 ? (
          <div className="space-y-4">
            {reviews.data.map((r) => (
              <Card key={r._id} className="rounded-2xl">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`h-4 w-4 ${i < r.rating ? 'fill-primary text-primary' : 'text-muted-foreground/30'}`}
                        />
                      ))}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  {r.comment && <p className="mt-2 leading-relaxed">{r.comment}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">No reviews yet.</p>
        )}
      </section>
    </div>
  );
}
