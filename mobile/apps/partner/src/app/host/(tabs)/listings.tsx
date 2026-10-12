import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Car, Plus, Search, Star, Upload } from 'lucide-react-native';
import { Button, Card, Chip, EmptyState, Input, Screen, ScreenHeader, SkeletonList, Text, space, useTheme } from '@catodrive/ui';
import { hostTripsApi } from '@catodrive/core/web/features/host/trips.api';
import { useMyVehicles } from '@catodrive/core/web/features/vehicles/hooks';
import type { Vehicle } from '@catodrive/core/web/features/vehicles/types';
import { formatMoney } from '@catodrive/core/web/lib/utils/format';

type TripStatus = '' | 'on_trip' | 'available';
const TRIP_FILTERS: { value: TripStatus; label: string }[] = [
  { value: '', label: 'Any trip status' },
  { value: 'on_trip', label: 'On a trip' },
  { value: 'available', label: 'Available' },
];
const LISTING_FILTERS = [
  { value: '', label: 'Any listing status' },
  { value: 'listed', label: 'Listed' },
  { value: 'unlisted', label: 'Unlisted' },
  { value: 'draft', label: 'Draft' },
];
const short = (d: string) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** The website's /host/listings: every car with search, trip and listing filters, and what each is doing now. */
export default function HostListingsScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const vehicles = useMyVehicles(true);
  const booked = useQuery({ queryKey: ['host-trips', 'booked'], queryFn: () => hostTripsApi.booked() });
  const [q, setQ] = useState('');
  const [tripStatus, setTripStatus] = useState<TripStatus>('');
  const [listingStatus, setListingStatus] = useState('');

  const onTrip = useMemo(() => {
    const map = new Map<string, { start: string; end: string }>();
    const now = Date.now();
    for (const t of booked.data ?? []) {
      if (+new Date(t.period.start) <= now && now <= +new Date(t.period.end)) map.set(t.vehicle._id, t.period);
    }
    return map;
  }, [booked.data]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (vehicles.data ?? []).filter((v) => {
      if (needle && !`${v.make} ${v.model} ${v.registrationNumber ?? ''}`.toLowerCase().includes(needle)) return false;
      if (tripStatus === 'on_trip' && !onTrip.has(v._id)) return false;
      if (tripStatus === 'available' && onTrip.has(v._id)) return false;
      if (listingStatus && v.status !== listingStatus) return false;
      return true;
    });
  }, [vehicles.data, q, tripStatus, listingStatus, onTrip]);

  const addCar = () => router.push('/host/listings/new');

  return (
    <Screen
      header={<ScreenHeader large title="Vehicles" subtitle="Host" right={<Button title="Add vehicle" size="sm" full={false} icon={<Plus size={16} color={c.primaryForeground} />} onPress={addCar} />} />}
      onRefresh={() => {
        void vehicles.refetch();
        void booked.refetch();
      }}
      refreshing={vehicles.isRefetching}
    >
      <Input value={q} onChangeText={setQ} placeholder="Make, model, plate #" left={<Search size={18} color={c.mutedForeground} />} autoCapitalize="none" returnKeyType="search" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {TRIP_FILTERS.map((f) => <Chip key={f.value || 'any-trip'} label={f.label} selected={tripStatus === f.value} onPress={() => setTripStatus(f.value)} />)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {LISTING_FILTERS.map((f) => <Chip key={f.value || 'any-listing'} label={f.label} selected={listingStatus === f.value} onPress={() => setListingStatus(f.value)} />)}
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text variant="caption" tone="muted" style={{ flex: 1 }}>{filtered.length} listing{filtered.length === 1 ? '' : 's'}</Text>
        <Button title="Import fleet" variant="ghost" size="sm" full={false} icon={<Upload size={16} color={c.foreground} />} onPress={() => router.push('/host/listings/import')} />
      </View>

      {vehicles.isPending ? <SkeletonList rows={4} height={96} /> : null}
      {vehicles.data && filtered.length === 0 ? (
        <EmptyState
          icon={<Car size={28} color={c.primary} />}
          title={vehicles.data.length ? 'No vehicles match' : 'No vehicles yet'}
          body={vehicles.data.length ? 'Try clearing the search or filters.' : 'List your first car to start earning.'}
          actionLabel={vehicles.data.length ? undefined : 'Add vehicle'}
          onAction={vehicles.data.length ? undefined : addCar}
        />
      ) : null}
      {filtered.map((v) => <ListingRow key={v._id} v={v} trip={onTrip.get(v._id)} onPress={() => router.push(`/host/listings/${v._id}`)} />)}
    </Screen>
  );
}

function ListingRow({ v, trip, onPress }: { v: Vehicle; trip?: { start: string; end: string }; onPress: () => void }) {
  const { c } = useTheme();
  const listed = v.status === 'listed';
  return (
    <Card onPress={onPress} accessibilityLabel={`${v.make} ${v.model} ${v.year}, ${v.status}`}>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ width: 112, height: 80, borderRadius: 12, overflow: 'hidden', backgroundColor: c.muted, alignItems: 'center', justifyContent: 'center' }}>
          {v.photos?.[0]?.url ? (
            <Image source={{ uri: v.photos[0].url }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" recyclingKey={v._id} />
          ) : (
            <Text variant="label" tone="muted">{v.make.slice(0, 1)}{v.model.slice(0, 1)}</Text>
          )}
          <View style={{ position: 'absolute', left: 6, top: 6, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: listed ? c.success : 'rgba(0,0,0,0.75)' }}>
            <Text variant="small" style={{ color: '#fff', textTransform: 'uppercase' }}>{v.status}</Text>
          </View>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', gap: space.xs }}>
            <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>{v.make} {v.model} {v.year}</Text>
            {v.ratingCount > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Star size={12} color={c.warning} fill={c.warning} />
                <Text variant="caption">{v.ratingAvg.toFixed(1)} <Text variant="caption" tone="muted">({v.totalTrips})</Text></Text>
              </View>
            ) : null}
          </View>
          <Text variant="caption" tone="muted" numberOfLines={1} style={{ textTransform: 'capitalize' }}>
            {v.category}{v.registrationNumber ? ` · ${v.registrationNumber}` : ''}
          </Text>
          <View style={{ flexDirection: 'row', marginTop: 'auto', alignItems: 'center' }}>
            <Text variant="caption" tone={trip ? 'primary' : 'success'} style={{ flex: 1 }} numberOfLines={1}>
              {trip ? `On a trip: ${short(trip.start)} – ${short(trip.end)}` : 'Available'}
            </Text>
            <Text variant="label">{formatMoney({ amount: v.pricing.dailyPrice, currency: v.pricing.currency })}/day</Text>
          </View>
        </View>
      </View>
    </Card>
  );
}
