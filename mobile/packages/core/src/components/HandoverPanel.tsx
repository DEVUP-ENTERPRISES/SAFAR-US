import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { CarFront, Clock, LocateFixed, MapPin, Navigation } from 'lucide-react-native';
import { Badge, Card, Skeleton, Text, useTheme, space } from '@catodrive/ui';
import { handoverApi } from '../web/features/ai/api';
import { openExternal } from '../links';

const mins = (s: number) => Math.max(1, Math.round(s / 60));
const miles = (m: number) => (m / 1609.34).toFixed(1);
const clockAt = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null);
const minutesUntil = (iso?: string) => (iso ? Math.round((new Date(iso).getTime() - Date.now()) / 60_000) : null);

/**
 * Getting guest and host to the car at the same time: the guest sees an ETA and
 * directions, the host sees when to leave. The guest's position is reported at
 * most once a minute while this screen is open.
 */
export function HandoverPanel({ tripId, role }: { tripId: string; role: 'guest' | 'host' }) {
  const { c } = useTheme();
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [denied, setDenied] = useState(false);
  const reported = useRef(0);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    void (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return setDenied(true);
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 30_000, distanceInterval: 25 }, (p) => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude };
        setPos(next);
        if (role === 'guest' && Date.now() - reported.current > 60_000) {
          reported.current = Date.now();
          handoverApi.reportLocation(tripId, next).catch(() => undefined);
        }
      });
      if (cancelled) sub.remove();
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [tripId, role]);

  const q = useQuery({
    queryKey: ['handover', tripId, pos?.lat, pos?.lng],
    queryFn: () => handoverApi.status(tripId, pos ?? undefined),
    refetchInterval: 60_000,
    retry: false,
  });
  if (q.isPending) return <Skeleton height={140} />;
  if (q.isError || !q.data) return null;
  const d = q.data;
  const leaveIn = minutesUntil(d.hostLeaveBy);
  const etaIn = minutesUntil(d.guestEtaAt);
  const guestMinutes = etaIn ?? (d.route ? mins(d.route.durationInTrafficSeconds) : null);

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Navigation size={18} color={c.primary} />
        <Text variant="heading" style={{ flex: 1 }}>{role === 'guest' ? 'Getting to your car' : 'Meeting your guest'}</Text>
        {d.route ? <Badge label={d.route.provider} /> : null}
      </View>

      <View style={{ marginVertical: space.md, gap: 4 }}>
        {role === 'host' ? (
          d.awaitingLocation || leaveIn === null ? (
            <>
              <Text>{d.awaitingLocation ? 'Waiting for your guest to share their location. Times will sharpen as they set off.' : 'Share your location to get a departure time.'}</Text>
              {d.guestEtaAt ? <Text variant="caption" tone="muted">Guest expected around {clockAt(d.guestEtaAt)}</Text> : null}
            </>
          ) : leaveIn <= 0 ? (
            <>
              <Text variant="title" tone="destructive">Leave now</Text>
              <Text tone="muted">{etaIn !== null && etaIn > 0 ? `Your guest arrives in about ${etaIn} min.` : 'Your guest is arriving.'}</Text>
            </>
          ) : (
            <>
              <Text variant="title">Leave in {leaveIn} min</Text>
              <View style={{ flexDirection: 'row', gap: space.md, flexWrap: 'wrap' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Clock size={14} color={c.mutedForeground} /><Text variant="caption" tone="muted">Set off by {clockAt(d.hostLeaveBy)}</Text></View>
                {d.guestEtaAt ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><CarFront size={14} color={c.mutedForeground} /><Text variant="caption" tone="muted">Guest arrives ~{clockAt(d.guestEtaAt)}</Text></View> : null}
              </View>
            </>
          )
        ) : denied || guestMinutes === null ? (
          <Text>Turn on location to see live directions.</Text>
        ) : (
          <>
            <Text variant="title">{guestMinutes > 0 ? `${guestMinutes} min` : 'Arriving'}</Text>
            {d.guestEtaAt ? <Text variant="caption" tone="muted">You arrive around {clockAt(d.guestEtaAt)}</Text> : null}
          </>
        )}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <MapPin size={16} color={c.mutedForeground} />
        <Text style={{ flex: 1 }}>{d.destination.label ?? 'Pickup location'}</Text>
        <Text variant="label" tone="primary" onPress={() => void openExternal(`https://www.google.com/maps/dir/?api=1&destination=${d.destination.lat},${d.destination.lng}`)}>Directions</Text>
      </View>
      {d.route ? <Text variant="caption" tone="muted">{miles(d.route.distanceMeters)} mi · {mins(d.route.durationInTrafficSeconds)} min in current traffic</Text> : null}
      {role === 'guest' && d.route?.steps.length ? (
        <View style={{ gap: 6, marginTop: space.md }}>
          {d.route.steps.slice(0, 6).map((s, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: space.sm }}>
              <Text variant="label" tone="primary" style={{ width: 18 }}>{i + 1}</Text>
              <Text variant="caption" style={{ flex: 1 }}>{s.instruction} <Text variant="caption" tone="muted">{miles(s.distanceMeters)} mi</Text></Text>
            </View>
          ))}
        </View>
      ) : null}
      {denied ? (
        <View style={{ flexDirection: 'row', gap: 6, marginTop: space.sm }}>
          <LocateFixed size={14} color={c.warning} />
          <Text variant="caption" tone="muted" style={{ flex: 1 }}>Location is off, so times fall back to the booked start. Turn it on for live navigation.</Text>
        </View>
      ) : null}
    </Card>
  );
}
