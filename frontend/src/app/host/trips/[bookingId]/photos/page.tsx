'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { hostTripsApi } from '@/features/host/trips.api';
import { InspectionPhotos } from '@/features/trips/components/inspection-photos';

/**
 * Condition photos. `pre` proves the car's state at handover and is what
 * qualifies the host for their protection plan; `post` is the evidence for any
 * damage claim. They are taken live in the app, keyed by booking so pickup
 * photos work before the guest has started the trip, and cannot be edited once
 * uploaded.
 */
export default function TripPhotosPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const router = useRouter();
  const [phase, setPhase] = useState<'pre' | 'post'>('pre');

  const { data: t, isLoading, isError } = useQuery({
    queryKey: ['host-trip', bookingId],
    queryFn: () => hostTripsApi.one(bookingId),
  });

  if (isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (isError || !t) return <ErrorState message="Trip not found." />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push(`/host/trips/${bookingId}`)}
          className="rounded-lg p-1.5 transition-colors hover:bg-accent"
          aria-label="Back to trip"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold leading-tight">Trip photos</h1>
          <p className="text-sm text-muted-foreground">
            {t.vehicle.make} {t.vehicle.model} · {t.photoCount} photo{t.photoCount === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        {(['pre', 'post'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPhase(p)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
              phase === p
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card hover:border-primary/40'
            }`}
          >
            {p === 'pre' ? 'Pickup' : 'Return'}
          </button>
        ))}
      </div>

      <InspectionPhotos bookingId={bookingId} phase={phase} />

      <Button variant="outline" className="w-full" onClick={() => router.push(`/host/trips/${bookingId}`)}>
        Done
      </Button>
    </div>
  );
}
