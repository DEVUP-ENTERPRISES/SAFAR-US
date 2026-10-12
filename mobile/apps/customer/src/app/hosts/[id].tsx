import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Car, Star } from 'lucide-react-native';
import { Avatar, Badge, Card, EmptyState, ErrorState, Screen, ScreenHeader, Section, Skeleton, Text, useTheme, space } from '@catodrive/ui';
import { useHostPublicProfile, joinedLabel, responseTimeLabel } from '@catodrive/core/web/features/host/public-profile';
import { hostApi } from '@catodrive/core/web/features/hosts/api';
import { reviewsApi } from '@catodrive/core/web/features/reviews/api';
import { VehicleCard } from '@/features/vehicles/VehicleCard';

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Card style={{ flex: 1 }}>
      <Text variant="title">{value}</Text>
      <Text variant="caption" tone="muted">{label}</Text>
    </Card>
  );
}

/** The website's /hosts/[id]: who the host is, their cars and their reviews. */
export default function HostProfileScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: h, isPending, isError } = useHostPublicProfile(id);
  const reviews = useQuery({ queryKey: ['reviews', id], queryFn: () => reviewsApi.forSubject(id), enabled: !!id });
  const vehicles = useQuery({ queryKey: ['host-vehicles', id], queryFn: () => hostApi.publicVehicles(id), enabled: !!id });
  const header = <ScreenHeader title={h?.displayName ?? 'Host'} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />;

  if (isPending) return <Screen header={header}><Skeleton height={120} /><Skeleton height={200} /></Screen>;
  if (isError || !h) return <Screen header={header}><ErrorState message="This host could not be found." /></Screen>;

  return (
    <Screen header={header}>
      <View style={{ alignItems: 'center', gap: space.sm }}>
        <Avatar uri={h.avatarUrl} name={h.displayName} size={104} />
        <Text variant="title" center>{h.displayName}</Text>
        {h.isSuperhost ? <Badge label="All-Star Host" tone="warning" /> : null}
        <Text variant="caption" tone="muted">Joined {joinedLabel(h.joinedAt)}{h.city ? ` · ${h.city}` : ''}</Text>
        {h.responseTimeMinutes !== null ? <Text variant="caption" tone="muted">Usually replies in {responseTimeLabel(h.responseTimeMinutes)}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Stat value={h.ratingAvg !== null ? `${h.ratingAvg.toFixed(1)} ★` : '-'} label={h.ratingCount > 0 ? `${h.ratingCount} review${h.ratingCount === 1 ? '' : 's'}` : 'No reviews yet'} />
        <Stat value={String(h.totalTrips)} label={`Trip${h.totalTrips === 1 ? '' : 's'} hosted`} />
        <Stat value={String(h.listedVehicles)} label={`Car${h.listedVehicles === 1 ? '' : 's'} listed`} />
      </View>
      {h.bio ? (
        <Section title={`About ${h.displayName}`}>
          <Text>{h.bio}</Text>
        </Section>
      ) : null}
      <Section title={`${h.displayName}'s cars`}>
        {vehicles.isPending ? (
          <Skeleton height={300} />
        ) : vehicles.data?.length ? (
          vehicles.data.map((v) => <VehicleCard key={v._id} vehicle={v} />)
        ) : (
          <EmptyState icon={<Car size={28} color={c.primary} />} title="No cars listed right now" body="This host doesn't have any cars available at the moment." />
        )}
      </Section>
      <Section title="Reviews">
        {reviews.data?.length ? (
          reviews.data.map((r) => (
            <Card key={r._id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', gap: 2 }}>
                  {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={14} color={i < Math.round(r.rating) ? '#f59e0b' : c.border} fill={i < Math.round(r.rating) ? '#f59e0b' : 'transparent'} />)}
                </View>
                <Text variant="caption" tone="muted">{new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</Text>
              </View>
              {r.comment ? <Text style={{ marginTop: space.sm }}>{r.comment}</Text> : null}
            </Card>
          ))
        ) : (
          <Text tone="muted">No reviews yet.</Text>
        )}
      </Section>
    </Screen>
  );
}
