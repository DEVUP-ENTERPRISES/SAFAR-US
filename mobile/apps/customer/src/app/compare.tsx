import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueries } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Check, Minus, Star, X } from 'lucide-react-native';
import { Button, EmptyState, Screen, ScreenHeader, Skeleton, Text, radius, space, useTheme } from '@catodrive/ui';
import { vehicleApi } from '@catodrive/core/web/features/vehicles/api';
import { COMPARE_ROWS, type CompareValue } from '@catodrive/core/web/features/vehicles/compare';
import type { Vehicle } from '@catodrive/core/web/features/vehicles/types';
import { coverOf } from '@/features/vehicles/VehicleCard';
import { useCompareStore } from '@/features/compare/compare-store';

const COL = 150;
const LABEL_COL = 110;

/** The website's /compare: up to three cars side by side, row by row. */
export default function CompareScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const qp = useLocalSearchParams<{ ids?: string }>();
  const remove = useCompareStore((s) => s.remove);
  const stored = useCompareStore((s) => s.ids);
  const ids = (qp.ids ?? '').split(',').filter(Boolean).filter((id) => stored.length === 0 || stored.includes(id));
  const results = useQueries({ queries: ids.map((id) => ({ queryKey: ['vehicle', id], queryFn: () => vehicleApi.getById(id) })) });
  const header = <ScreenHeader title="Compare cars" subtitle={ids.length ? `${ids.length} vehicle${ids.length === 1 ? '' : 's'} selected` : undefined} onBack={() => (router.canGoBack() ? router.back() : router.replace('/search'))} />;

  if (results.some((r) => r.isPending)) return <Screen header={header}><Skeleton height={320} /></Screen>;
  const cars = results.map((r) => r.data).filter(Boolean) as Vehicle[];
  if (cars.length === 0) {
    return (
      <Screen header={header}>
        <EmptyState title="Nothing to compare" body="Add cars from search to compare them side by side." actionLabel="Browse cars" onAction={() => router.replace('/search')} />
      </Screen>
    );
  }

  const cell = (val: CompareValue) => {
    if ('yes' in val) return val.yes ? <Check size={20} color={c.primary} /> : <Minus size={16} color={c.mutedForeground} />;
    if ('rating' in val) {
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Star size={14} color="#fbbf24" fill="#fbbf24" />
          <Text variant="label">{val.rating}</Text>
          <Text variant="caption" tone="muted">({val.count})</Text>
        </View>
      );
    }
    if ('tags' in val) {
      if (!val.tags.length) return <Minus size={16} color={c.mutedForeground} />;
      return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {val.tags.map((t) => (
            <View key={t} style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.muted, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text variant="small">{t}</Text>
            </View>
          ))}
          {val.more > 0 ? <Text variant="small" tone="muted">+{val.more} more</Text> : null}
        </View>
      );
    }
    if (val.muted) {
      return (
        <View style={{ alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: c.primarySoft }}>
          <Text variant="small" tone="primary">{val.text}</Text>
        </View>
      );
    }
    return <Text variant={val.strong ? 'heading' : 'label'} style={val.capitalize ? { textTransform: 'capitalize' } : undefined}>{val.text}</Text>;
  };

  return (
    <Screen header={header} padded={false}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg }}>
        <View>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ width: LABEL_COL }} />
            {cars.map((car) => {
              const cover = coverOf(car);
              return (
                <View key={car._id} style={{ width: COL, padding: space.sm, gap: space.sm }}>
                  <View style={{ aspectRatio: 4 / 3, borderRadius: 12, overflow: 'hidden', backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
                    {cover ? <Image source={{ uri: cover }} style={{ width: '100%', height: '100%' }} contentFit="cover" accessibilityLabel={`${car.make} ${car.model}`} /> : <Text variant="title" style={{ color: '#fff' }}>{car.make[0]}{car.model[0]}</Text>}
                    <Pressable accessibilityRole="button" accessibilityLabel="Remove from compare" onPress={() => { remove(car._id); router.setParams({ ids: ids.filter((x) => x !== car._id).join(',') }); }} style={{ position: 'absolute', top: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={14} color="#fff" />
                    </Pressable>
                  </View>
                  <Pressable accessibilityRole="link" onPress={() => router.push(`/vehicles/${car._id}`)}>
                    <Text variant="label" numberOfLines={1}>{car.make} {car.model}</Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>{car.year} · {car.location.city || '—'}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
          {COMPARE_ROWS.map((row, i) => (
            <View key={row.label} style={{ flexDirection: 'row', backgroundColor: i % 2 === 0 ? c.card : c.subtle }}>
              <View style={{ width: LABEL_COL, padding: space.sm, justifyContent: 'center' }}>
                <Text variant="caption" tone="muted">{row.label}</Text>
              </View>
              {cars.map((car) => (
                <View key={car._id} style={{ width: COL, padding: space.sm, justifyContent: 'center' }}>
                  {cell(row.get(car))}
                </View>
              ))}
            </View>
          ))}
          <View style={{ flexDirection: 'row', paddingVertical: space.md }}>
            <View style={{ width: LABEL_COL }} />
            {cars.map((car) => (
              <View key={car._id} style={{ width: COL, paddingHorizontal: space.sm }}>
                <Button title="Book this car" size="sm" onPress={() => router.push(`/vehicles/${car._id}`)} />
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
