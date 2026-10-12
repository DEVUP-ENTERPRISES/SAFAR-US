import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Card, Divider, EmptyState, ErrorState, KeyValue, Screen, ScreenHeader, Section, SkeletonList, Text, space } from '@catodrive/ui';
import { corporateApi } from '@catodrive/core/web/features/corporate/api';
import { formatDate, formatMoney } from '@catodrive/core/web/lib/utils/format';

/** The website's /corporate/invoices: the consolidated invoice, by cost center and by booking. */
export default function CorporateInvoicesScreen() {
  const q = useQuery({ queryKey: ['corp-invoice'], queryFn: () => corporateApi.invoice() });
  const d = q.data;
  const money = (v: number) => formatMoney({ amount: v, currency: d?.currency ?? 'USD' });
  return (
    <Screen header={<ScreenHeader large title="Consolidated invoice" />} onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      {q.isPending ? <SkeletonList rows={3} height={90} /> : null}
      {q.isError && !d ? <ErrorState message="We couldn’t load the invoice." onRetry={() => void q.refetch()} /> : null}
      {d ? (
        <>
          <Card>
            <Text variant="small" tone="muted">TOTAL</Text>
            <Text variant="display">{money(d.total)}</Text>
          </Card>
          {d.lines.length === 0 ? <EmptyState title="No billable trips yet" body="Booked corporate trips appear here." /> : null}
          {d.byCostCenter.length > 0 ? (
            <Section title="By cost center">
              <Card>
                <View style={{ gap: space.sm }}>
                  {d.byCostCenter.map((x) => <KeyValue key={x.costCenterId} label={x.name} value={money(x.amount)} />)}
                </View>
              </Card>
            </Section>
          ) : null}
          {d.lines.length > 0 ? (
            <Section title="Bookings">
              <Card>
                {d.lines.map((l, i) => (
                  <View key={l.bookingCode}>
                    {i > 0 ? <Divider /> : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md }}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="label">{l.bookingCode}</Text>
                        <Text variant="caption" tone="muted">{formatDate(l.date)} · {l.costCenter} · {l.status.replace(/_/g, ' ')}</Text>
                      </View>
                      <Text variant="label">{money(l.amount)}</Text>
                    </View>
                  </View>
                ))}
              </Card>
            </Section>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
