import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Card, Chip, EmptyState, ErrorState, Screen, ScreenHeader, Section, SkeletonList, StatTile, space } from '@catodrive/ui';
import { assetPartnerApi, type PartnerStatement } from '@catodrive/core/web/features/asset-partners/api';
import { formatMoney } from '@catodrive/core/web/lib/utils/format';
import { NotAPartner } from '@/features/asset-partners/NotAPartner';
import { StatementCard } from '@/features/asset-partners/StatementCard';
import { isNotEnrolled } from '@/features/asset-partners/notEnrolled';

const RANGES = [6, 12, 24];

/** The website's /asset-partners/statements: every month itemised, with closed-month totals. */
export default function PartnerStatementsScreen() {
  const [months, setMonths] = useState(12);
  const q = useQuery({ queryKey: ['asset-partner-statements', months], queryFn: () => assetPartnerApi.statements(months), retry: false });
  const data = q.data;
  const currency = data?.[0]?.currency ?? 'USD';
  const money = (v: number) => formatMoney({ amount: v, currency });
  const closed = (data ?? []).filter((s) => s.final);
  const lifetimeNet = closed.reduce((sum, s) => sum + s.totals.net, 0);
  const lifetimeGross = closed.reduce((sum, s) => sum + s.totals.gross, 0);
  const bestMonth = closed.reduce<PartnerStatement | null>((best, s) => (!best || s.totals.net > best.totals.net ? s : best), null);

  return (
    <Screen
      header={<ScreenHeader large title="Statements" subtitle="Every month, itemised - gross, management fee, insurance, detailing and your net." />}
      onRefresh={() => void q.refetch()}
      refreshing={q.isRefetching}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {RANGES.map((m) => <Chip key={m} label={`Last ${m} months`} selected={months === m} onPress={() => setMonths(m)} />)}
      </ScrollView>
      {q.isPending ? <SkeletonList rows={3} height={200} /> : null}
      {q.isError && isNotEnrolled(q.error) ? <NotAPartner /> : null}
      {q.isError && !isNotEnrolled(q.error) && !data ? <ErrorState message="We couldn’t load your statements." onRetry={() => void q.refetch()} /> : null}
      {data && data.length === 0 ? <EmptyState title="No statements yet" body="Your first statement appears once your car completes a trip." /> : null}
      {data && data.length > 0 ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
            <StatTile label="Net, closed months" value={money(lifetimeNet)} sub={`${closed.length} month${closed.length === 1 ? '' : 's'}`} tone={lifetimeNet >= 0 ? 'success' : 'warning'} />
            <StatTile label="Gross, closed months" value={money(lifetimeGross)} />
            <StatTile label="Best month" value={bestMonth ? money(bestMonth.totals.net) : '-'} sub={bestMonth?.period} />
          </View>
          {closed.length > 1 ? (
            <Card>
              <BarChart data={closed.slice().reverse().map((s) => ({ label: s.period.slice(5), value: s.totals.net }))} format={money} />
            </Card>
          ) : null}
          <Section title="Month by month">
            {data.map((s) => <StatementCard key={s.period} statement={s} />)}
          </Section>
        </>
      ) : null}
    </Screen>
  );
}
