import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Award, Settings2, ShieldCheck, Users, Zap } from 'lucide-react-native';
import { Card, Text, useTheme, radius, space } from '@catodrive/ui';
import type { Vehicle } from '@catodrive/core/web/features/vehicles/types';
import { WishlistButton } from '@/features/favorites/WishlistButton';
import { CompareButton } from '@/features/compare/CompareButton';
import { VehicleRating } from './VehicleRating';
import { DailyPrice } from './DailyPrice';

export const coverOf = (v: Pick<Vehicle, 'photos'>) => v.photos?.find((p) => p.isCover)?.url ?? v.photos?.[0]?.url;

function Chip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View style={styles.chip}>
      {icon}
      <Text variant="small" style={styles.chipText}>{label}</Text>
    </View>
  );
}

function Spec({ icon, label, tint }: { icon: React.ReactNode; label: string; tint?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[styles.spec, { backgroundColor: tint ? c.primarySoft : c.muted }]}>
      {icon}
      <Text variant="caption" tone={tint ? 'primary' : 'muted'} style={{ textTransform: 'capitalize' }}>{label}</Text>
    </View>
  );
}

/** The website's car card: photo, status chips, save, name, year and city, rating, specs and daily price. */
export const VehicleCard = memo(function VehicleCard({ vehicle, width }: { vehicle: Vehicle; width?: number }) {
  const { c } = useTheme();
  const router = useRouter();
  const cover = coverOf(vehicle);
  return (
    <Card padded={false} style={[width ? { width } : null]} onPress={() => router.push(`/vehicles/${vehicle._id}`)} accessibilityLabel={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}>
      <View style={[styles.photo, { backgroundColor: c.muted }]}>
        {cover ? (
          <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} cachePolicy="memory-disk" recyclingKey={vehicle._id} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.noPhoto, { backgroundColor: c.primary }]}>
            <Text variant="display" style={{ color: '#fff', opacity: 0.9, fontSize: 56, lineHeight: 60 }}>{vehicle.make.slice(0, 1)}{vehicle.model.slice(0, 1)}</Text>
          </View>
        )}
        <View style={styles.chips}>
          {vehicle.fleetOwned ? <Chip icon={<ShieldCheck size={12} color="#fff" />} label="CatoDrive Fleet" /> : null}
          {vehicle.hostIsSuperhost ? <Chip icon={<Award size={12} color="#facc15" />} label="Superhost" /> : null}
          {vehicle.listing.instantBook ? <Chip icon={<Zap size={12} color="#fff" fill="#fff" />} label="Instant" /> : null}
        </View>
        <View style={styles.save}>
          <WishlistButton vehicleId={vehicle._id} />
          <CompareButton vehicleId={vehicle._id} />
        </View>
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text variant="heading" numberOfLines={2}>{vehicle.make} {vehicle.model}</Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>{vehicle.year} · {vehicle.location.city || '-'}</Text>
          </View>
          <VehicleRating vehicle={vehicle} />
        </View>
        <View style={styles.specs}>
          <Spec icon={<Users size={13} color={c.mutedForeground} />} label={String(vehicle.seats)} />
          <Spec icon={<Settings2 size={13} color={c.mutedForeground} />} label={vehicle.transmission} />
          {vehicle.fuelType === 'ev' ? <Spec icon={<Zap size={13} color={c.primary} />} label="Electric" tint /> : null}
        </View>
        <View style={[styles.price, { borderTopColor: c.border }]}>
          <DailyPrice amount={vehicle.pricing.dailyPrice} currency={vehicle.pricing.currency} />
          <Text variant="caption" tone="muted"> / day</Text>
        </View>
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  photo: { aspectRatio: 4 / 3, width: '100%', overflow: 'hidden' },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  chips: { position: 'absolute', top: space.sm, left: space.sm, right: 56, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { color: '#fff' },
  save: { position: 'absolute', top: space.sm, right: space.sm, gap: space.sm },
  body: { padding: space.lg, gap: space.md },
  titleRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  specs: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  spec: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  price: { flexDirection: 'row', alignItems: 'baseline', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.md },
});
