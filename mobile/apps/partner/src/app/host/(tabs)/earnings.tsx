import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, TrendingUp, Wallet, Zap } from 'lucide-react-native';
import { Badge, BarChart, Button, Card, Divider, ErrorState, Screen, ScreenHeader, SkeletonList, StatTile, Text, space, useConfirm, useTheme } from '@catodrive/ui';
import { hostApi } from '@catodrive/core/web/features/host/api';
import { useEarnings, useInstantPayout, usePayouts } from '@catodrive/core/web/features/host/hooks';
import { instantPayoutQuote } from '@catodrive/core/web/features/host/payouts';
import { formatDate, formatMoney } from '@catodrive/core/web/lib/utils/format';
import { EarningsInsights } from '@/features/host/EarningsInsights';
import { PayoutConnect } from '@/features/host/PayoutConnect';
import { PayoutReadinessCard } from '@/features/host/PayoutReadinessCard';

/** The website's /host/earnings: payout readiness, balances, instant cash-out, revenue by month, payout history and insight. */
export default function HostEarningsScreen() {
  const { c } = useTheme();
  const confirm = useConfirm();
  const earnings = useEarnings();
  const payouts = usePayouts();
  const instant = useInstantPayout();
  const readiness = useQuery({ queryKey: ['payout-readiness'], queryFn: () => hostApi.payoutReadiness(), retry: false });
  const data = earnings.data;
  const cur = data?.currency ?? 'USD';
  const money = (v: number) => formatMoney({ amount: v, currency: cur });
  const icon = (I: typeof Wallet) => <I size={16} color={c.mutedForeground} />;

  const cashOut = async () => {
    if (!data) return;
    const { fee, net } = instantPayoutQuote(data.pendingPayout);
    const { ok } = await confirm({
      title: 'Cash out instantly?',
      description: `You’ll receive ${money(net)} now instead of ${money(data.pendingPayout)} after the hold window - a ${money(fee)} instant-payout fee. This cannot be undone.`,
      confirmLabel: `Cash out ${money(net)}`,
    });
    if (ok) instant.mutate();
  };

  return (
    <Screen
      header={<ScreenHeader large title="Earnings" subtitle={data ? `${data.completedTrips} completed trip${data.completedTrips === 1 ? '' : 's'}. Payouts release after the trip-completion hold window.` : 'Host'} />}
      onRefresh={() => {
        void Promise.all([earnings.refetch(), payouts.refetch(), readiness.refetch()]);
      }}
      refreshing={earnings.isRefetching}
    >
      {earnings.isPending ? <SkeletonList rows={3} height={110} /> : null}
      {earnings.isError && !data ? <ErrorState message="We couldn’t load your earnings." onRetry={() => void earnings.refetch()} /> : null}
      {data ? (
        <>
          <PayoutReadinessCard />
          {!readiness.data?.destination.platformOwned ? <PayoutConnect /> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
            <StatTile icon={icon(TrendingUp)} label="Lifetime earnings" value={money(data.lifetimeEarnings)} />
            <StatTile icon={icon(Wallet)} label="Available balance" value={money(data.currentBalance)} tone="success" />
            <StatTile icon={icon(Clock)} label="Pending payout" value={money(data.pendingPayout)} sub={data.pendingPayout > 0 ? 'Cash out below' : undefined} tone={data.pendingPayout > 0 ? 'warning' : undefined} />
            <StatTile icon={icon(CheckCircle2)} label="Paid out" value={money(data.paidOut)} />
          </View>

          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Zap size={16} color={c.primary} />
              <Text variant="heading">Instant payout</Text>
            </View>
            <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>Cash out your scheduled earnings now instead of waiting for the hold window. A 1.5% fee (min $0.50) applies.</Text>
            <Text variant="label" style={{ marginTop: space.sm }}>{money(data.pendingPayout)} available</Text>
            <Button title="Cash out now" icon={<Zap size={16} color={c.primaryForeground} />} disabled={data.pendingPayout <= 0} loading={instant.isPending} style={{ marginTop: space.md }} onPress={() => void cashOut()} />
            {instant.isSuccess && instant.data ? (
              <Text variant="caption" tone="success" style={{ marginTop: space.sm }}>
                Paid out {money(instant.data.net)} ({instant.data.paidCount} payout{instant.data.paidCount === 1 ? '' : 's'}, {money(instant.data.fee)} fee) ✓
              </Text>
            ) : null}
          </Card>

          {data.monthly.length > 0 ? (
            <Card>
              <Text variant="heading" style={{ marginBottom: space.md }}>Revenue - last {data.monthly.length} months</Text>
              <BarChart data={data.monthly.map((mo) => ({ label: mo.month.slice(5), value: mo.amount }))} format={money} />
            </Card>
          ) : null}

          <Card>
            <Text variant="heading">Payout history</Text>
            {payouts.isPending ? <SkeletonList rows={2} height={44} /> : null}
            {payouts.data && payouts.data.length === 0 ? <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>No payouts yet. Complete a trip to start earning.</Text> : null}
            {payouts.data?.map((p, i) => (
              <View key={p._id}>
                {i > 0 ? <Divider /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="label">
                      {formatMoney({ amount: p.amount, currency: p.currency })}
                      {p.instant ? <Text variant="caption" tone="primary">  ⚡ instant</Text> : null}
                    </Text>
                    <Text variant="caption" tone="muted">{p.status === 'paid' && p.paidAt ? `Paid ${formatDate(p.paidAt)}` : `Scheduled ${formatDate(p.scheduledFor)}`}</Text>
                  </View>
                  <Badge label={p.status} tone={p.status === 'paid' ? 'success' : p.status === 'failed' ? 'destructive' : 'neutral'} />
                </View>
              </View>
            ))}
          </Card>

          <EarningsInsights />
        </>
      ) : null}
    </Screen>
  );
}
