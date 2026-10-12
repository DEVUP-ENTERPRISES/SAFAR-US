import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Divider, EmptyState, Input, KeyValue, Screen, ScreenHeader, Section, SkeletonList, Text, space, useTheme } from '@catodrive/ui';
import { RequireAuth } from '@catodrive/core';
import { hostApi } from '@catodrive/core/web/features/host/api';
import { formatMoney } from '@catodrive/core/web/lib/utils/format';
import { FleetPolicyCard } from '@/features/host/FleetPolicyCard';

const usd = (amount: number) => formatMoney({ amount, currency: 'USD' });

/** The website's /host/fleet: group cars into fleets, set fleet-wide delivery policy, and read each fleet's numbers and P&L. */
function FleetManagement() {
  const { c } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const fleets = useQuery({ queryKey: ['fleets'], queryFn: () => hostApi.fleets() });
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => hostApi.createFleet(name),
    onSuccess: () => {
      setName('');
      void qc.invalidateQueries({ queryKey: ['fleets'] });
    },
  });
  const dashboard = useQuery({ queryKey: ['fleet-dashboard', selected], queryFn: () => hostApi.fleetDashboard(selected!), enabled: !!selected });
  const pnl = useQuery({ queryKey: ['fleet-pnl', selected], queryFn: () => hostApi.fleetProfitability(selected!), enabled: !!selected });
  const fleet = fleets.data?.find((f) => f._id === selected);

  return (
    <Screen header={<ScreenHeader title="Fleet management" onBack={() => (router.canGoBack() ? router.back() : router.replace('/host/menu'))} />} onRefresh={() => void fleets.refetch()} refreshing={fleets.isRefetching}>
      <Card>
        <Text variant="heading">Create a fleet</Text>
        <View style={{ gap: space.md, marginTop: space.md }}>
          <Input label="Fleet name" value={name} onChangeText={setName} placeholder="Airport fleet" />
          <Button title="Create" disabled={!name} loading={create.isPending} onPress={() => create.mutate()} />
        </View>
      </Card>

      {fleets.isPending ? <SkeletonList rows={2} height={64} /> : null}
      {fleets.data && fleets.data.length === 0 ? <EmptyState title="No fleets yet" body="Group your vehicles into fleets to track occupancy and revenue." /> : null}
      {fleets.data?.map((fl) => (
        <Card key={fl._id} onPress={() => setSelected(fl._id)} style={selected === fl._id ? { borderColor: c.primary, borderWidth: 1.5 } : undefined} accessibilityLabel={fl.name}>
          <Text variant="label">{fl.name}</Text>
          <Text variant="caption" tone="muted">{fl.region ?? 'All regions'}</Text>
        </Card>
      ))}

      {fleet ? <FleetPolicyCard key={fleet._id} fleet={fleet} /> : null}

      {selected && dashboard.data ? (
        <Section title={`${dashboard.data.name} - analytics`}>
          <Card>
            <View style={{ gap: space.sm }}>
              <KeyValue label="Vehicles" value={String(dashboard.data.totalVehicles)} />
              <KeyValue label="Listed" value={String(dashboard.data.listedVehicles)} />
              <KeyValue label="Occupancy" value={`${dashboard.data.occupancyPct}%`} />
              <KeyValue label="Trips" value={String(dashboard.data.totalTrips)} />
              <KeyValue label="Revenue" value={usd(dashboard.data.revenue)} strong />
            </View>
          </Card>
        </Section>
      ) : null}

      {selected && pnl.data ? (
        <Section title="Profitability (P&L)">
          <Card>
            <View style={{ gap: space.sm }}>
              <KeyValue label="Gross revenue" value={usd(pnl.data.totals.grossRevenue)} />
              <KeyValue label="Platform commission" value={`−${usd(pnl.data.totals.commission)}`} tone="muted" />
              <KeyValue label="Host earnings" value={usd(pnl.data.totals.hostEarnings)} />
              <KeyValue label="Maintenance cost" value={`−${usd(pnl.data.totals.maintenanceCost)}`} tone="muted" />
              <Divider />
              <KeyValue
                label={`Net profit · ${(pnl.data.totals.marginBps / 100).toFixed(1)}% margin`}
                value={usd(pnl.data.totals.netProfit)}
                strong
                tone={pnl.data.totals.netProfit >= 0 ? 'success' : 'destructive'}
              />
            </View>
          </Card>
          {pnl.data.vehicles.map((v) => (
            <Card key={v.vehicleId}>
              <Text variant="label">{v.label}</Text>
              <View style={{ gap: 4, marginTop: space.sm }}>
                <KeyValue label="Trips" value={String(v.trips)} tone="muted" />
                <KeyValue label="Host earnings" value={usd(v.hostEarnings)} tone="muted" />
                <KeyValue label="Maintenance" value={`−${usd(v.maintenanceCost)}`} tone="muted" />
                <KeyValue label="Net profit" value={usd(v.netProfit)} strong tone={v.netProfit >= 0 ? 'success' : 'destructive'} />
              </View>
            </Card>
          ))}
          <Text variant="caption" tone="muted">Net profit = host earnings (after platform commission) − maintenance costs. Based on completed trips.</Text>
        </Section>
      ) : null}
    </Screen>
  );
}

export default function FleetScreen() {
  return (
    <RequireAuth>
      <FleetManagement />
    </RequireAuth>
  );
}
