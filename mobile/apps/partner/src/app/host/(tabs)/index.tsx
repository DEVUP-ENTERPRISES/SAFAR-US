import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Car, ChevronRight, Plus, Sparkles, TrendingUp, Wallet } from 'lucide-react-native';
import { Badge, Button, Card, EmptyState, KeyValue, Screen, ScreenHeader, Section, Skeleton, SkeletonList, Text, space, useTheme } from '@catodrive/ui';
import { PushPrompt } from '@catodrive/core';
import { hostApi } from '@catodrive/core/web/features/host/api';
import { useEarnings, useHostMe } from '@catodrive/core/web/features/host/hooks';
import { useMyVehicles } from '@catodrive/core/web/features/vehicles/hooks';
import { formatMoney } from '@catodrive/core/web/lib/utils/format';
import { FleetCard } from '@/features/host/FleetCard';
import { useOpenHref } from '@/features/workspace/useOpenHref';

/** The website's /host: what needs attention, the money, and the cars. */
export default function HostDashboardScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const openHref = useOpenHref();
  const host = useHostMe();
  const earnings = useEarnings();
  const vehicles = useMyVehicles(true);
  const inbox = useQuery({ queryKey: ['host-inbox'], queryFn: () => hostApi.inboxActions(), retry: false });
  const payout = useQuery({ queryKey: ['payout-readiness'], queryFn: () => hostApi.payoutReadiness(), retry: false });

  const cur = earnings.data?.currency ?? 'USD';
  const money = (v: number) => formatMoney({ amount: v, currency: cur });
  const cars = vehicles.data ?? [];
  const actions = inbox.data?.items ?? [];
  const blockers = (payout.data?.blockers ?? []).filter((b) => b.severity === 'blocking');
  const e = earnings.data;
  const hasHistory = (e?.lifetimeEarnings ?? 0) > 0 || (e?.completedTrips ?? 0) > 0;
  const addCar = () => router.push('/host/listings/new');

  return (
    <Screen
      header={<ScreenHeader large title={host.data?.displayName ?? 'Your dashboard'} subtitle="Host" right={<Button title="Add a car" size="sm" full={false} icon={<Plus size={16} color={c.primaryForeground} />} onPress={addCar} />} />}
      onRefresh={() => {
        void Promise.all([host.refetch(), earnings.refetch(), vehicles.refetch(), inbox.refetch(), payout.refetch()]);
      }}
      refreshing={earnings.isRefetching}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm }}>
        {host.data ? <Badge label={host.data.verificationStatus} tone={host.data.verificationStatus === 'verified' ? 'success' : 'warning'} /> : null}
        {host.data?.isSuperhost ? <Badge label="All-Star Host" tone="primary" /> : null}
        <Text variant="caption" tone="muted">{cars.length} car{cars.length === 1 ? '' : 's'}</Text>
      </View>

      <PushPrompt title="Get booking alerts on this device" detail="New bookings, requests to accept and guest messages arrive instantly, even when CatoDrive isn’t open." successBody="We’ll alert you about bookings and messages." />

      {actions.length > 0 || blockers.length > 0 ? (
        <Section
          title="Needs attention"
          action={(inbox.data?.atRiskTotal ?? 0) > 0 ? <Text variant="caption" tone="warning">{money(inbox.data!.atRiskTotal)} at risk</Text> : undefined}
        >
          {blockers.map((b) => (
            <AttentionRow key={b.key} icon={<Wallet size={18} color={c.destructive} />} title={b.label} detail={b.detail} onPress={() => openHref(b.href)} />
          ))}
          {actions.slice(0, 4).map((a) => (
            <AttentionRow key={a.id} icon={<AlertTriangle size={18} color={c.warning} />} title={a.title} detail={a.detail} amount={a.atRisk ? money(a.atRisk) : undefined} onPress={() => openHref(a.href)} />
          ))}
        </Section>
      ) : null}

      {earnings.isPending ? <Skeleton height={180} /> : hasHistory && e ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TrendingUp size={16} color={c.mutedForeground} />
            <Text variant="caption" tone="muted">Lifetime earnings</Text>
          </View>
          <Text variant="display" style={{ marginTop: 4 }}>{money(e.lifetimeEarnings)}</Text>
          <Text variant="caption" tone="muted">Across {e.completedTrips ?? 0} completed trip{e.completedTrips === 1 ? '' : 's'}</Text>
          <View style={{ gap: space.sm, marginTop: space.md }}>
            <KeyValue label="Available now" value={money(e.currentBalance)} />
            <KeyValue label="Pending payout" value={money(e.pendingPayout)} />
            <KeyValue label="Paid out" value={money(e.paidOut)} />
          </View>
          <Button title="View breakdown" variant="ghost" style={{ marginTop: space.sm }} onPress={() => router.navigate('/host/earnings')} />
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={<Sparkles size={28} color={c.primary} />}
            title="No earnings yet"
            body={cars.length === 0 ? 'List your first car and your earnings will appear here after your first completed trip.' : 'Your cars are live. Earnings appear here once your first trip completes.'}
            actionLabel={cars.length === 0 ? 'List a car' : 'Review your listings'}
            onAction={() => (cars.length === 0 ? addCar() : router.navigate('/host/listings'))}
          />
        </Card>
      )}

      <Section title="Your cars" action={cars.length > 3 ? <Button title="View all" variant="ghost" size="sm" full={false} onPress={() => router.navigate('/host/listings')} /> : undefined}>
        {vehicles.isPending ? <SkeletonList rows={2} height={220} /> : null}
        {vehicles.data && cars.length === 0 ? (
          <Card>
            <EmptyState icon={<Car size={28} color={c.primary} />} title="No cars listed yet" body="Adding a car takes a few minutes - we read most of the details from the VIN." actionLabel="Add a car" onAction={addCar} />
          </Card>
        ) : null}
        {cars.slice(0, 6).map((v) => <FleetCard key={v._id} v={v} />)}
      </Section>
    </Screen>
  );
}

function AttentionRow({ icon, title, detail, amount, onPress }: { icon: React.ReactNode; title: string; detail: string; amount?: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Card onPress={onPress} accessibilityLabel={title}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        {icon}
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label">{title}</Text>
          <Text variant="caption" tone="muted" numberOfLines={2}>{detail}</Text>
        </View>
        {amount ? <Text variant="label" tone="warning">{amount}</Text> : null}
        <ChevronRight size={18} color={c.mutedForeground} />
      </View>
    </Card>
  );
}
