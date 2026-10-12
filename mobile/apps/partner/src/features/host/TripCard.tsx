import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { User } from 'lucide-react-native';
import { Card, Text, space, useTheme } from '@catodrive/ui';
import type { HostTrip } from '@catodrive/core/web/features/host/trips.api';
import { TRIP_ACTIVE, flightLine, nextHandoverLine, tripTiming } from '@catodrive/core/web/features/host/trip-timing';
import { TimingPill } from './TimingPill';

/** One trip in the host's list: what happens next with this car, the guest, and the car. */
export function TripCard({ trip }: { trip: HostTrip }) {
  const { c } = useTheme();
  const router = useRouter();
  const t = tripTiming(trip);
  const flight = flightLine(trip);
  const next = TRIP_ACTIVE.includes(trip.status) ? nextHandoverLine(trip.timeline) : null;
  const title = `${trip.vehicle.make} ${trip.vehicle.model} ${trip.vehicle.year || ''}`.trim();
  return (
    <Card onPress={() => router.push(`/host/trips/${trip.bookingId}`)} accessibilityLabel={`${t.label}, ${title}, ${trip.guest.name}`}>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ flex: 1, gap: 6 }}>
          <TimingPill tone={t.tone} label={t.label} />
          <Text variant="title" numberOfLines={1}>{title}</Text>
          {trip.pickupAddress ? <Text tone="muted" numberOfLines={1}>{trip.pickupAddress}</Text> : null}
          {flight ? <Text variant="caption" tone="primary">{flight}</Text> : null}
          {next ? <Text variant="caption" tone="primary" numberOfLines={1}>{next}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 2 }}>
            {trip.guest.avatarUrl ? (
              <Image source={{ uri: trip.guest.avatarUrl }} style={{ width: 28, height: 28, borderRadius: 14 }} />
            ) : (
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.muted, alignItems: 'center', justifyContent: 'center' }}>
                <User size={16} color={c.mutedForeground} />
              </View>
            )}
            <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>
              {trip.guest.name} <Text variant="caption" tone="muted">#{trip.code}</Text>
            </Text>
          </View>
        </View>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <View style={{ width: 80, height: 64, borderRadius: 8, overflow: 'hidden', backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
            {trip.vehicle.photoUrl ? (
              <Image source={{ uri: trip.vehicle.photoUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" />
            ) : (
              <Text variant="label" style={{ color: 'rgba(255,255,255,0.7)' }}>{trip.vehicle.make.slice(0, 1)}{trip.vehicle.model.slice(0, 1)}</Text>
            )}
          </View>
          {trip.vehicle.plate ? <Text variant="small" tone="muted">{trip.vehicle.plate}</Text> : null}
        </View>
      </View>
    </Card>
  );
}
