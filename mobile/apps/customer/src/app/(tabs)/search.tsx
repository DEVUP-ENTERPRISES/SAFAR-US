import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { ArrowUpDown, Bell, SearchX, SlidersHorizontal, Zap } from 'lucide-react-native';
import { BottomSheet, Button, Chip, EmptyState, ErrorState, SkeletonList, Text, useTheme, useToast, space } from '@catodrive/ui';
import { useFacets, useFilterCounts, useVehicleSearch } from '@catodrive/core/web/features/vehicles/hooks';
import { useSearchBar, toIso } from '@catodrive/core/web/features/search/search-store';
import { SORTS, EMPTY_FILTERS, activeFilterCount, buildSearchParams, savedSearchInput, type SearchFilters } from '@catodrive/core/web/features/search/search-params';
import { savedSearchApi } from '@catodrive/core/web/features/saved-search/api';
import { useAuthStore } from '@catodrive/core/web/features/auth/store';
import type { Vehicle } from '@catodrive/core/web/features/vehicles/types';
import { SearchBar } from '@/features/search/SearchBar';
import { FilterSheet } from '@/features/search/FilterSheet';
import { VehicleCard } from '@/features/vehicles/VehicleCard';

/** The website's /search: the shared search bar, filters, sort, save search and results. */
export default function SearchScreen() {
  const { c } = useTheme();
  const toast = useToast();
  const qp = useLocalSearchParams<{ city?: string; start?: string; end?: string; category?: string; instant?: string; delivery?: string }>();
  const facets = useFacets();
  const cities = facets.data?.cities ?? [];
  const categories = facets.data?.categories ?? [];
  const signedIn = useAuthStore((s) => s.status === 'authenticated');
  const bar = useSearchBar();

  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    bar.patch({
      city: qp.city ?? bar.city,
      fromDate: (qp.start ?? bar.fromDate).slice(0, 10),
      untilDate: (qp.end ?? bar.untilDate).slice(0, 10),
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [filters, setFilters] = useState<SearchFilters>({
    ...EMPTY_FILTERS,
    category: qp.category ?? '',
    instantBook: qp.instant === '1',
    delivery: qp.delivery === '1',
  });
  const [sheet, setSheet] = useState<'filters' | 'sort' | null>(null);

  const activeCity = cities.find((x) => x.city === bar.city) ?? cities[0];
  const city = activeCity?.city ?? bar.city;
  const coords = bar.center ? { lat: bar.center.lat, lng: bar.center.lng } : activeCity ? { lat: activeCity.lat, lng: activeCity.lng } : undefined;
  const areaLabel = bar.center ? bar.center.label : city;
  const startIso = toIso(bar.fromDate, bar.fromTime);
  const endIso = toIso(bar.untilDate, bar.untilTime);
  const params = useMemo(() => buildSearchParams(coords, { startIso, endIso }, filters), [coords?.lat, coords?.lng, startIso, endIso, filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useVehicleSearch(params);
  const counts = useFilterCounts(params).data;
  const active = activeFilterCount(filters);
  const saveSearch = useMutation({
    mutationFn: () => savedSearchApi.create(savedSearchInput(city, filters)),
    onSuccess: () => toast({ tone: 'success', title: 'Search saved', body: "We'll let you know when new cars match." }),
  });

  const renderItem = useCallback(({ item }: { item: Vehicle }) => <VehicleCard vehicle={item} />, []);
  const sortLabel = SORTS.find((s) => s.key === filters.sort)?.label ?? 'Sort';

  const header = (
    <View style={styles.header}>
      <SearchBar />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label={active ? `Filters · ${active}` : 'Filters'} selected={active > 0} icon={<SlidersHorizontal size={16} color={active ? c.inkForeground : c.foreground} />} onPress={() => setSheet('filters')} />
        <Chip label="Instant Book" selected={filters.instantBook} icon={<Zap size={16} color={filters.instantBook ? c.inkForeground : c.warning} />} onPress={() => setFilters({ ...filters, instantBook: !filters.instantBook })} />
        <Chip label="Deliver to me" selected={filters.delivery} onPress={() => setFilters({ ...filters, delivery: !filters.delivery })} />
        <Chip label={sortLabel} icon={<ArrowUpDown size={16} color={c.foreground} />} onPress={() => setSheet('sort')} />
      </ScrollView>
      <View style={styles.countRow}>
        <View style={{ flex: 1 }}>
          <Text variant="title">{results.isFetching ? 'Searching…' : `${results.data?.length ?? 0} cars available`}</Text>
          {areaLabel ? <Text variant="caption" tone="muted">in {areaLabel}</Text> : null}
        </View>
        {signedIn ? (
          <Button title={saveSearch.isSuccess ? 'Saved' : 'Save search'} size="sm" variant="outline" full={false} loading={saveSearch.isPending} icon={<Bell size={16} color={c.foreground} />} onPress={() => saveSearch.mutate()} />
        ) : null}
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.flex, { backgroundColor: c.background }]}>
      <FlatList
        data={results.data ?? []}
        keyExtractor={(v) => v._id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={{ height: space.lg }} />}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        onRefresh={() => void results.refetch()}
        refreshing={results.isRefetching}
        initialNumToRender={4}
        windowSize={7}
        removeClippedSubviews
        ListEmptyComponent={
          !params || results.isPending ? (
            <SkeletonList rows={3} height={300} />
          ) : results.isError ? (
            <ErrorState message="Couldn’t load cars." onRetry={() => void results.refetch()} />
          ) : (
            <EmptyState
              icon={<SearchX size={28} color={c.primary} />}
              title="No cars match your filters"
              body="Try widening your search or clearing filters."
              actionLabel={active ? 'Clear filters' : undefined}
              onAction={() => setFilters({ ...EMPTY_FILTERS, sort: filters.sort })}
            />
          )
        }
      />

      <FilterSheet visible={sheet === 'filters'} onClose={() => setSheet(null)} value={filters} onChange={setFilters} categories={categories} counts={counts} total={counts?.total} />

      <BottomSheet visible={sheet === 'sort'} onClose={() => setSheet(null)} title="Sort by">
        {SORTS.map((s) => (
          <Chip
            key={s.key}
            label={s.label}
            selected={filters.sort === s.key}
            onPress={() => {
              setFilters({ ...filters, sort: s.key });
              setSheet(null);
            }}
          />
        ))}
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: space.lg, paddingBottom: space.xxxl },
  header: { gap: space.lg, marginBottom: space.lg },
  chips: { gap: space.sm, paddingRight: space.lg },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
