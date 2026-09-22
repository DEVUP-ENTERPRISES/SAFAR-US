'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Car, ChevronRight, ShieldCheck, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, EmptyState } from '@/components/ui/states';
import { captainApi, ABILITY_LABELS } from '@/features/host/team-api';
import { formatDate } from '@/lib/utils/format';

export default function CaptainQueuePage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['captain-queue'],
    queryFn: () => captainApi.queue(),
  });

  if (isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (isError) {
    return <ErrorState message="Couldn't load your queue. Check your connection and try again." retry={() => refetch()} />;
  }
  if (!data) {
    return <ErrorState message="You're not on a team yet. Ask whoever invited you to send a new invite link." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <div>
          <h1 className="display text-2xl">{data.fleetName}</h1>
          <p className="text-sm text-muted-foreground">
            {data.staff.title ? `${data.staff.title} · ` : ''}
            {data.staff.abilities.map((a) => ABILITY_LABELS[a].label).join(', ')}
          </p>
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">Your jobs</p>
        {data.trips.length === 0 ? (
          <EmptyState
            icon={<Clock className="h-6 w-6" />}
            title="Nothing due right now"
            description="Trips on your assigned cars will show up here as they're due for handover."
          />
        ) : (
          <div className="space-y-3">
            {data.trips.map((t) => (
              <Link key={t._id} href={`/host/trips/${t.bookingId}`}>
                <Card className="transition hover:border-primary/40">
                  <CardContent className="flex items-center gap-4 py-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted">
                      <Car className="h-5 w-5 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {t.vehicle ? `${t.vehicle.year} ${t.vehicle.make} ${t.vehicle.model}` : 'Vehicle'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t.vehicle?.licensePlate ? `${t.vehicle.licensePlate} · ` : ''}
                        {t.handover?.at ? `Handed over ${formatDate(t.handover.at)}` : 'Handover pending'}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
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
