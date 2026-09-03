'use client';

import { MapPinOff, Navigation, ShieldAlert, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils/cn';
import { TripLiveMap } from '@/features/trips/components/trip-live-map';
import { useTrackingState } from '@/features/trips/hooks';

/**
 * Location, and why it is or is not on screen.
 *
 * The rule this enforces is that a map never appears without a sentence
 * explaining it. Both parties see the same state and the same reason, so
 * neither is guessing whether the other can see them — which is the actual
 * anxiety, more than the tracking itself.
 *
 * The quiet middle is rendered deliberately rather than left blank: a host who
 * simply finds no map assumes it is broken and asks support. A host told "this
 * is off during the trip, and here is when it comes back" does not.
 */
export function TrackingPanel({
  tripId,
  role,
}: {
  tripId: string;
  role: 'guest' | 'host';
}) {
  const q = useTrackingState(tripId);

  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.isError || !q.data) return null;

  const t = q.data;
  const canSee = t.trackingEnabled && t.viewers.includes(role);
  const opensAt = t.opensAt ? new Date(t.opensAt) : null;

  // Off entirely — before the window opens, or after the trip closed.
  if (!t.trackingEnabled) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 py-5">
          <MapPinOff className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-semibold">
              {t.phase === 'in_trip' ? 'Location is off during the trip' : 'Location sharing is not on'}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t.phase === 'in_trip'
                ? role === 'host'
                  ? 'You can see the trip status, not where the car is. Location comes back on shortly before the return so you can meet your guest.'
                  : 'Your host cannot see where you are. Location comes back on shortly before you return the car.'
                : opensAt
                  ? `Sharing starts around ${opensAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}, close to the handover.`
                  : 'Nothing is being shared for this trip.'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const exception = t.isException;

  return (
    <Card className={cn(exception ? 'border-warning/50 bg-warning/5' : 'border-primary/30')}>
      <CardContent className="py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {exception ? (
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            ) : (
              <Navigation className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            )}
            <div>
              <p className="font-semibold">
                {exception
                  ? 'Location is being shared'
                  : t.phase === 'return'
                    ? 'Sharing location for the drop-off'
                    : 'Sharing location for the handover'}
              </p>
              {/* The reason comes from the server, so what is on screen and
                  what the system actually decided cannot drift apart. */}
              {t.reason && <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">{t.reason}</p>}
            </div>
          </div>
          <Badge tone={exception ? 'warning' : 'success'}>
            {exception ? t.exceptionKind ?? 'exception' : 'Live'}
          </Badge>
        </div>

        {canSee ? (
          <div className="mt-4 overflow-hidden rounded-xl">
            <TripLiveMap tripId={tripId} height="15rem" />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            You are sharing your position, but not viewing anyone else&apos;s.
          </p>
        )}

        {t.closesAt && !exception && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Stops automatically at{' '}
            {new Date(t.closesAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
