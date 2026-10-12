import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Car, CheckSquare, TrendingUp, Users, Wallet } from 'lucide-react-native';
import { BarChart, Button, Card, ErrorState, RankedBars, Screen, ScreenHeader, SkeletonList, StatTile, Text, space, useTheme } from '@catodrive/ui';
import { corporateApi } from '@catodrive/core/web/features/corporate/api';
import { formatMoney, monthShort } from '@catodrive/core/web/lib/utils/format';

/** The website's /corporate: spend, approvals waiting, members and cost centers. */
export default function CorporateDashboardScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const q = useQuery({ queryKey: ['corp-dashboard'], queryFn: () => corporateApi.dashboard(), refetchInterval: 30_000 });
  const d = q.data;
  const money = (v: number) => formatMoney({ amount: v, currency: d?.currency ?? 'USD' });
  const icon = (I: typeof Car) => <I size={16} color={c.mutedForeground} />;

  return (
    <Screen
      header={<ScreenHeader large title={d?.org.name ?? 'Corporate'} subtitle={d ? d.role.replace('_', ' ') : 'Corporate mobility'} />}
      onRefresh={() => void q.refetch()}
      refreshing={q.isRefetching}
    >
      {q.isPending ? <SkeletonList rows={4} height={100} /> : null}
      {q.isError && !d ? <ErrorState message="We couldn’t load your organization’s dashboard." onRetry={() => void q.refetch()} /> : null}
      {d ? (
        <>
          <Text tone="muted">Corporate mobility - manage members, budgets, policy and invoices.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
            <StatTile icon={icon(TrendingUp)} label="Total spend" value={money(d.totalSpend)} sub={`${d.totalTrips} trip${d.totalTrips === 1 ? '' : 's'}`} />
            <StatTile
              icon={icon(CheckSquare)}
              label="Pending approvals"
              value={String(d.pendingApprovals)}
              sub={d.pendingApprovals > 0 ? 'Blocking travel' : 'All clear'}
              tone={d.pendingApprovals > 0 ? 'warning' : undefined}
              onPress={() => router.navigate('/corporate/approvals')}
            />
            <StatTile icon={icon(Users)} label="Members" value={String(d.members)} onPress={() => router.navigate('/corporate/members')} />
            <StatTile icon={icon(Wallet)} label="Cost centers" value={String(d.costCenters)} onPress={() => router.push('/corporate/cost-centers')} />
          </View>
          <Card>
            <Text variant="heading" style={{ marginBottom: space.md }}>Spend - last 6 months</Text>
            <BarChart data={(d.spendByMonth ?? []).map((x) => ({ label: monthShort(x.month), value: x.amount }))} format={money} />
          </Card>
          <Card>
            <Text variant="heading" style={{ marginBottom: space.md }}>Spend by cost center</Text>
            {d.spendByCostCenter?.length ? <RankedBars data={d.spendByCostCenter} format={money} /> : <Text variant="caption" tone="muted">No spend yet.</Text>}
          </Card>
          <Card>
            <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
              <Car size={18} color={c.primary} />
              <Text variant="caption" style={{ flex: 1 }}>Employees request business trips; managers approve them under your travel policy.</Text>
            </View>
            <Button title="Review requests" variant="ghost" style={{ marginTop: space.sm }} onPress={() => router.navigate('/corporate/approvals')} />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
