import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Car, CheckCircle2, Gauge, TrendingUp } from 'lucide-react-native';
import { BarChart, Card, Divider, EmptyState, ErrorState, Screen, ScreenHeader, SkeletonList, StatTile, Text, space, useTheme } from '@catodrive/ui';
import { RequireAuth } from '@catodrive/core';
import { hostApi } from '@catodrive/core/web/features/host/api';
import { formatMoney } from '@catodrive/core/web/lib/utils/format';

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (m: string) => MONTHS[Number(m.split('-')[1])] ?? m;

/** The website's /host/performance: occupancy, acceptance, earnings trend and which cars earn the most. */
function Performance() {
  const { c } = useTheme();
  const router = useRouter();
  const q = useQuery({ queryKey: ['host-performance'], queryFn: () => hostApi.performance() });
  const d = q.data;
  const m = (v: number) => formatMoney({ amount: v, currency: d?.currency ?? 'USD' });
  const icon = (I: typeof Car) => <I size={16} color={c.mutedForeground} />;
  const top = d?.perVehicle.slice(0, 5) ?? [];
  const topMax = Math.max(1, ...top.map((v) => v.revenue));

  return (
    <Screen
      header={<ScreenHeader title="Performance" subtitle="Earnings trend, how full your cars are, and which ones earn the most." onBack={() => (router.canGoBack() ? router.back() : router.replace('/host/menu'))} />}
      onRefresh={() => void q.refetch()}
      refreshing={q.isRefetching}
    >
      {q.isPending ? <SkeletonList rows={3} height={110} /> : null}
      {q.isError && !d ? <ErrorState message="We couldn’t load your performance." onRetry={() => void q.refetch()} /> : null}
      {d ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
            <StatTile icon={icon(Gauge)} label="Occupancy (next 30 days)" value={`${d.occupancyPct}%`} sub="Booked vehicle-days" tone={d.occupancyPct >= 70 ? 'success' : d.occupancyPct >= 40 ? 'warning' : undefined} />
            <StatTile icon={icon(CheckCircle2)} label="Acceptance rate" value={`${d.acceptanceRate}%`} sub={`${d.completedTrips} completed · ${d.cancelledByHost} declined`} />
            <StatTile icon={icon(Car)} label="Active vehicles" value={String(d.perVehicle.length)} sub="Earning on the platform" />
          </View>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: space.md }}>
              <TrendingUp size={16} color={c.primary} />
              <Text variant="heading">Earnings trend</Text>
            </View>
            <BarChart data={d.earningsByMonth.map((x) => ({ label: monthLabel(x.month), value: x.amount }))} format={m} />
          </Card>
          <Card>
            <Text variant="heading">Revenue by vehicle</Text>
            {top.length ? (
              <View style={{ gap: space.md, marginTop: space.md }}>
                {top.map((v) => (
                  <View key={v.vehicleId} style={{ gap: 4 }} accessibilityLabel={`${v.label}: ${m(v.revenue)}`}>
                    <View style={{ flexDirection: 'row', gap: space.sm }}>
                      <Text variant="caption" numberOfLines={1} style={{ flex: 1 }}>{v.label}</Text>
                      <Text variant="caption" style={{ fontWeight: '600' }}>{m(v.revenue)}</Text>
                    </View>
                    <View style={{ height: 8, borderRadius: 4, backgroundColor: c.muted, overflow: 'hidden' }}>
                      <View style={{ width: `${Math.max(2, Math.round((v.revenue / topMax) * 100))}%`, height: '100%', borderRadius: 4, backgroundColor: c.primary }} />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>No trips yet.</Text>
            )}
          </Card>
          <Card>
            <Text variant="heading">Per-vehicle breakdown</Text>
            {d.perVehicle.length === 0 ? (
              <EmptyState icon={<Car size={28} color={c.primary} />} title="No revenue yet" body="Complete a trip to see per-vehicle numbers." />
            ) : (
              d.perVehicle.map((v, i) => (
                <View key={v.vehicleId}>
                  {i > 0 ? <Divider /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md }}>
                    <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>{v.label}</Text>
                    <Text variant="caption" tone="muted">{v.trips} trip{v.trips === 1 ? '' : 's'}</Text>
                    <Text variant="label">{m(v.revenue)}</Text>
                  </View>
                </View>
              ))
            )}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

export default function PerformanceScreen() {
  return (
    <RequireAuth>
      <Performance />
    </RequireAuth>
  );
}
