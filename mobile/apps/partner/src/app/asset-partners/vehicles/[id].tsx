import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, BarChart, Card, Divider, EmptyState, ErrorState, Screen, ScreenHeader, SkeletonList, StatTile, Text, space } from '@catodrive/ui';
import { RequireAuth } from '@catodrive/core';
import { assetPartnerApi } from '@catodrive/core/web/features/asset-partners/api';
import { formatDate, formatDay, formatMoney } from '@catodrive/core/web/lib/utils/format';
import { VehiclePhoto } from '@/features/asset-partners/VehiclePhoto';

const currency = 'USD';
const money = (v: number) => formatMoney({ amount: v, currency });

/** The website's /asset-partners/vehicles/[id]: one car's month, its net by month, trips and maintenance. */
function PartnerVehicle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const q = useQuery({ queryKey: ['asset-partner-vehicle', id], queryFn: () => assetPartnerApi.vehicle(id), retry: false, enabled: !!id });
  const maintenance = useQuery({ queryKey: ['asset-partner-maintenance'], queryFn: () => assetPartnerApi.maintenance() });
  const data = q.data;
  const live = data?.status === 'listed';
  const forThisCar = (maintenance.data ?? []).filter((m) => m.vehicleId === id);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/asset-partners/vehicles'));

  return (
    <Screen header={<ScreenHeader title="Your vehicles" onBack={back} />} onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      {q.isPending ? <SkeletonList rows={2} height={180} /> : null}
      {q.isError && !data ? <ErrorState message="We couldn’t find that vehicle." onRetry={() => void q.refetch()} /> : null}
      {data ? (
        <>
          <Card padded={false}>
            <VehiclePhoto url={data.photo} style={{ aspectRatio: 16 / 9, width: '100%' }} />
            <View style={{ padding: space.lg, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Badge label={live ? 'Live' : data.status.replace(/_/g, ' ')} tone={live ? 'success' : 'neutral'} />
                {data.plate ? <Text variant="caption" tone="muted">{data.plate}</Text> : null}
              </View>
              <Text variant="title">{data.year} {data.make} {data.model}{data.trim ? ` ${data.trim}` : ''}</Text>
              {data.vin ? <Text variant="caption" tone="muted">VIN {data.vin}</Text> : null}
              <Text variant="caption" tone="muted">In the programme since {formatDate(data.createdAt)}</Text>
            </View>
          </Card>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
            <StatTile label="Net this month" value={money(data.net)} sub="After fee, insurance, detailing" tone={data.net >= 0 ? 'success' : 'warning'} />
            <StatTile label="Gross this month" value={money(data.gross)} />
            <StatTile label="Trips this month" value={String(data.trips)} />
          </View>

          {data.monthly.length > 0 ? (
            <Card>
              <Text variant="heading" style={{ marginBottom: space.md }}>This car’s net by month</Text>
              <BarChart data={data.monthly.map((m) => ({ label: m.period.slice(5), value: m.net }))} format={money} />
            </Card>
          ) : null}

          <Card>
            <Text variant="heading">Recent trips</Text>
            {data.recentTrips.length === 0 ? (
              <EmptyState title="No trips yet" body="Completed trips on this car will appear here." />
            ) : (
              data.recentTrips.map((t, i) => (
                <View key={t.bookingId}>
                  {i > 0 ? <Divider /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="label">{t.code}</Text>
                      <Text variant="caption" tone="muted">{formatDate(t.start)} → {formatDate(t.end)}</Text>
                    </View>
                    <Text variant="label">{money(t.gross)}</Text>
                  </View>
                </View>
              ))
            )}
          </Card>

          <Card>
            <Text variant="heading">Maintenance history</Text>
            {forThisCar.length === 0 ? (
              <EmptyState title="Nothing logged" body="Servicing and repairs on this car will appear here." />
            ) : (
              forThisCar.map((m, i) => (
                <View key={m._id}>
                  {i > 0 ? <Divider /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="label" style={{ textTransform: 'capitalize' }}>{m.type}</Text>
                      <Text variant="caption" tone="muted">{formatDay(m.scheduledFor)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      {typeof m.cost === 'number' ? <Text variant="label">{money(m.cost)}</Text> : null}
                      {m.approval === 'pending' ? <Badge label="Needs you" tone="warning" /> : null}
                      {m.approval === 'declined' ? <Badge label="Declined" tone="destructive" /> : null}
                    </View>
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

export default function PartnerVehicleScreen() {
  return (
    <RequireAuth>
      <PartnerVehicle />
    </RequireAuth>
  );
}
