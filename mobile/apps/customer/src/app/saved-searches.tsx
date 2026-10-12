import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, Search, Trash2 } from 'lucide-react-native';
import { Card, EmptyState, ErrorState, Screen, ScreenHeader, SkeletonList, Text, useConfirm, useTheme, space } from '@catodrive/ui';
import { RequireAuth } from '@catodrive/core';
import { savedSearchApi, searchParamsOf, summariseSearch, type SavedSearch } from '@catodrive/core/web/features/saved-search/api';
import { useSearchBar } from '@catodrive/core/web/features/search/search-store';

/** The website's /saved-searches: alerts on or off, rerun, delete. */
function SavedSearches() {
  const { c } = useTheme();
  const router = useRouter();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const setBar = useSearchBar((s) => s.patch);
  const { data, isPending, isError, refetch, isRefetching } = useQuery({ queryKey: ['saved-searches'], queryFn: () => savedSearchApi.list() });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['saved-searches'] });
  const toggle = useMutation({ mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => savedSearchApi.setAlerts(id, enabled), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: string) => savedSearchApi.remove(id), onSuccess: invalidate });

  const rerun = (s: SavedSearch) => {
    const p = searchParamsOf(s.criteria);
    if (p.city) setBar({ city: p.city, center: null });
    router.navigate({ pathname: '/search', params: p.category ? { category: p.category } : {} });
  };

  return (
    <Screen header={<ScreenHeader title="Saved searches" subtitle="We’ll alert you when a new car matches." onBack={() => router.back()} />} onRefresh={() => void refetch()} refreshing={isRefetching}>
      {isPending ? (
        <SkeletonList rows={3} height={72} />
      ) : isError ? (
        <ErrorState message="Couldn’t load your saved searches." onRetry={() => void refetch()} />
      ) : !data.length ? (
        <EmptyState icon={<Search size={28} color={c.primary} />} title="No saved searches yet" body="Run a search and tap “Save search” to be told about new cars." actionLabel="Browse cars" onAction={() => router.navigate('/search')} />
      ) : (
        data.map((s) => (
          <Card key={s._id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Run ${s.label}`} onPress={() => rerun(s)} style={{ flex: 1, gap: 2 }}>
                <Text variant="label">{s.label}</Text>
                <Text variant="caption" tone="muted" style={{ textTransform: 'capitalize' }}>{s.criteria.city ? `${s.criteria.city} - ` : ''}{summariseSearch(s.criteria)}</Text>
              </Pressable>
              <Pressable accessibilityRole="switch" accessibilityState={{ checked: s.alertsEnabled }} accessibilityLabel={s.alertsEnabled ? 'Alerts on - mute' : 'Alerts off - unmute'} hitSlop={8} onPress={() => toggle.mutate({ id: s._id, enabled: !s.alertsEnabled })}>
                {s.alertsEnabled ? <Bell size={20} color={c.primary} /> : <BellOff size={20} color={c.mutedForeground} />}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${s.label}`}
                hitSlop={8}
                onPress={async () => {
                  const { ok } = await confirm({ title: `Delete “${s.label}”?`, description: 'You’ll stop getting alerts for this search.', confirmLabel: 'Delete', tone: 'destructive' });
                  if (ok) remove.mutate(s._id);
                }}
              >
                <Trash2 size={20} color={c.mutedForeground} />
              </Pressable>
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

export default function SavedSearchesScreen() {
  return (
    <RequireAuth>
      <SavedSearches />
    </RequireAuth>
  );
}
