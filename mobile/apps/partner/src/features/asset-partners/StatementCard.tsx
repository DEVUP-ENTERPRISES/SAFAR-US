import { View } from 'react-native';
import { FileText } from 'lucide-react-native';
import { Badge, Card, Divider, KeyValue, Text, space, useTheme } from '@catodrive/ui';
import type { PartnerStatement } from '@catodrive/core/web/features/asset-partners/api';
import { formatDate, formatMoney } from '@catodrive/core/web/lib/utils/format';

/** One month on partner terms, every deduction itemised so the net can be checked against the agreement. */
export function StatementCard({ statement, compact = false }: { statement: PartnerStatement; compact?: boolean }) {
  const { c } = useTheme();
  const money = (v: number) => formatMoney({ amount: v, currency: statement.currency });
  const t = statement.totals;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md }}>
        <FileText size={18} color={c.primary} />
        <Text variant="heading" style={{ flex: 1 }}>Statement · {statement.period}</Text>
        <Badge label={statement.final ? 'Final' : 'In progress'} tone={statement.final ? 'neutral' : 'warning'} />
      </View>
      <View style={{ gap: space.sm }}>
        <KeyValue label="Gross booking revenue" value={money(t.gross)} />
        <KeyValue label={`Management fee (${statement.terms.managementFeeBps / 100}%)`} value={`−${money(t.managementFee)}`} />
        <KeyValue label="Fleet insurance" value={`−${money(t.insurance)}`} tone="muted" />
        <KeyValue label="Professional detailing" value={`−${money(t.detailing)}`} tone="muted" />
        <Divider />
        <KeyValue label="Your net" value={money(t.net)} strong />
      </View>
      {!compact && statement.lines.length > 0 ? (
        <View style={{ gap: space.sm, marginTop: space.md }}>
          <Text variant="small" tone="muted">PER VEHICLE</Text>
          {statement.lines.map((l) => <KeyValue key={l.vehicleId} label={l.label} value={money(l.net)} />)}
        </View>
      ) : null}
      <Text variant="caption" tone="muted" style={{ marginTop: space.md }}>
        Paid {formatDate(statement.payoutDate)} by {statement.payoutMethod}. Insurance and detailing are charged monthly per vehicle while it is in the programme, whether or not it was booked.
      </Text>
    </Card>
  );
}
