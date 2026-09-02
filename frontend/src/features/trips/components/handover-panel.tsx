'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigation, MapPin, Clock, CarFront, LocateFixed } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils/cn';
import { handoverApi } from '@/features/ai/api';

const mins = (s: number) => Math.max(1, Math.round(s / 60));
const miles = (m: number) => (m / 1609.34).toFixed(1);

function clockAt(iso?: string) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Minutes from now until `iso`; negative means it has passed. */
function minutesUntil(iso?: string): number | null {
  if (!iso) return null;
  return Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
}

/**
 * The handover, as both parties see it.
 *
 * The guest gets navigation to the car. The host gets a countdown to when they
 * should leave — computed from where the guest actually is, not from the booked
 * start time. So if the guest is stuck, the host's departure moves with them and
 * neither person waits in a car park.
 *
 * The guest's browser reports position on a timer; that same feed is what drives
 * the host's countdown. Location is asked for, never assumed: if the guest
 * declines, the panel degrades to the scheduled time and says so rather than
 * showing a confident number built on nothing.
 */
export function HandoverPanel({ tripId, role }: { tripId: string; role: 'guest' | 'host' }) {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [denied, setDenied] = useState(false);
  const reported = useRef(0);

  // Watch our own position, and (as the guest) push it so the host's clock tracks us.
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude };
        setPos(next);
        // Throttle: the host's countdown does not improve with sub-minute updates.
        if (role === 'guest' && Date.now() - reported.current > 60_000) {
          reported.current = Date.now();
          handoverApi.reportLocation(tripId, next).catch(() => undefined);
        }
      },
      () => setDenied(true),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [tripId, role]);

  const q = useQuery({
    queryKey: ['handover', tripId, pos?.lat, pos?.lng],
    queryFn: () => handoverApi.status(tripId, pos ?? undefined),
    // Traffic moves; a stale ETA is worse than no ETA.
    refetchInterval: 60_000,
    retry: false,
  });

  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.isError || !q.data) return null;

  const d = q.data;
  const leaveIn = minutesUntil(d.hostLeaveBy);
  const etaIn = minutesUntil(d.guestEtaAt);

  return (
    <Card className={cn(d.hostShouldLeaveNow && role === 'host' && 'border-primary ring-1 ring-primary')}>
      <CardContent className="py-5">
        <p className="flex items-center gap-2 font-semibold">
          <Navigation className="h-5 w-5 text-primary" />
          {role === 'guest' ? 'Getting to your car' : 'Meeting your guest'}
          {d.route && <Badge tone="muted">{d.route.provider}</Badge>}
        </p>

        {/* The headline number, different per role, same underlying clock. */}
        {role === 'host' ? (
          <HostClock leaveIn={leaveIn} leaveBy={d.hostLeaveBy} etaIn={etaIn} eta={d.guestEtaAt} awaiting={d.awaitingLocation} />
        ) : (
          <GuestClock etaIn={etaIn} eta={d.guestEtaAt} route={d.route} denied={denied} />
        )}

        <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
          {d.destination.label ?? 'Pickup location'}
        </p>

        {d.route && (
          <p className="numeric mt-1 text-sm text-muted-foreground">
            {miles(d.route.distanceMeters)} mi · {mins(d.route.durationInTrafficSeconds)} min in current traffic
          </p>
        )}

        {/* Turn-by-turn, for the party actually driving. */}
        {role === 'guest' && (d.route?.steps.length ?? 0) > 0 && (
          <ol className="mt-4 space-y-2 border-t border-border pt-3">
            {d.route!.steps.slice(0, 6).map((s, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="numeric mt-0.5 h-5 w-5 shrink-0 rounded-full bg-muted text-center text-xs font-semibold leading-5">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  {s.instruction}
                  <span className="numeric ms-2 text-xs text-muted-foreground">{miles(s.distanceMeters)} mi</span>
                </span>
              </li>
            ))}
          </ol>
        )}

        {denied && (
          <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
            <LocateFixed className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Location is off, so times fall back to the booked start. Turn it on for live navigation.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function GuestClock({
  etaIn, eta, route, denied,
}: {
  etaIn: number | null; eta?: string;
  route?: { durationInTrafficSeconds: number }; denied: boolean;
}) {
  if (denied || (etaIn === null && !route)) {
    return <p className="mt-3 text-sm text-muted-foreground">Turn on location to see live directions.</p>;
  }
  const m = etaIn ?? (route ? mins(route.durationInTrafficSeconds) : null);
  return (
    <div className="mt-3">
      <p className="numeric display text-4xl leading-none">
        {m !== null && m > 0 ? `${m} min` : 'Arriving'}
      </p>
      {eta && <p className="mt-1 text-sm text-muted-foreground">You arrive around {clockAt(eta)}</p>}
    </div>
  );
}

function HostClock({
  leaveIn, leaveBy, etaIn, eta, awaiting,
}: {
  leaveIn: number | null; leaveBy?: string;
  etaIn: number | null; eta?: string; awaiting: boolean;
}) {
  if (awaiting || leaveIn === null) {
    return (
      <div className="mt-3">
        <p className="text-sm text-muted-foreground">
          {awaiting
            ? 'Waiting for your guest to share their location. Times will sharpen as they set off.'
            : 'Share your location to get a departure time.'}
        </p>
        {eta && <p className="mt-1 text-sm">Guest expected around {clockAt(eta)}</p>}
      </div>
    );
  }

  // The moment that matters.
  if (leaveIn <= 0) {
    return (
      <div className="mt-3">
        <p className="display text-4xl leading-none text-primary">Leave now</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {etaIn !== null && etaIn > 0
            ? `Your guest arrives in about ${etaIn} min.`
            : 'Your guest is arriving.'}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <p className="numeric display text-4xl leading-none">Leave in {leaveIn} min</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" /> Set off by {clockAt(leaveBy)}
        </span>
        {eta && (
          <span className="inline-flex items-center gap-1">
            <CarFront className="h-3.5 w-3.5" /> Guest arrives ~{clockAt(eta)}
          </span>
        )}
      </p>
    </div>
  );
}
