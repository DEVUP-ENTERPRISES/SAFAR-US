import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { History } from 'lucide-react-native';
import { Badge, Button, Card, Text, useTheme, space, type BadgeTone } from '@catodrive/ui';
import { EXCEPTION_REASON_LABEL, EXCEPTION_STATUS_LABEL } from '@catodrive/core/web/features/bookings/status';
import type { Booking, ExceptionReasonCode } from '@catodrive/core/web/features/bookings/types';
import { formatDateTime, formatMoney } from '@catodrive/core/web/lib/utils/format';
import { ExceptionForm } from '@/features/bookings/ChangeTrip';

const KIND_LABEL = { pickup_shift: 'Pickup time changed', move: 'Dates changed', switch_car: 'Car switched' } as const;
const TONE: Record<string, BadgeTone> = { pending: 'warning', approved: 'success', partial: 'success', rejected: 'neutral' };
// The server enforces the real window; this only stops offering the form on old trips.
const OFFER_WINDOW_MS = 48 * 3_600_000;

/** What changed on this trip, and the guest's refund review if they asked for one. */
export function TripChangesCard({ booking: b }: { booking: Booking }) {
  const { c } = useTheme();
  const [asking, setAsking] = useState(false);
  const changes = b.changes ?? [];
  const kept = b.cancellation?.charged?.amount ?? 0;
  const canAsk = b.status === 'cancelled_guest' && kept > 0 && !b.exception && !!b.cancellation && Date.now() - new Date(b.cancellation.at).getTime() < OFFER_WINDOW_MS;
  if (!changes.length && !b.exception && !canAsk) return null;

  if (asking) {
    return <ExceptionForm bookingId={b._id} reasons={Object.keys(EXCEPTION_REASON_LABEL) as ExceptionReasonCode[]} proofRequired onDone={() => setAsking(false)} onSkip={() => setAsking(false)} />;
  }

  return (
    <Card>
      <View style={[styles.row, { marginBottom: space.sm }]}>
        <History size={18} color={c.primary} />
        <Text variant="heading">Trip changes</Text>
      </View>
      <View style={{ gap: space.md }}>
        {changes.map((ch, i) => (
          <View key={i} style={{ gap: 2 }}>
            <Text variant="label">{KIND_LABEL[ch.kind]}</Text>
            <Text variant="caption" tone="muted">
              {ch.kind === 'pickup_shift' ? `Pickup now ${formatDateTime(ch.to.start)}` : ch.kind === 'move' ? `${formatDateTime(ch.to.start)} – ${formatDateTime(ch.to.end)}` : 'Same dates, same price'}
              {ch.difference && ch.difference.amount !== 0 ? ` · ${ch.difference.amount > 0 ? `paid ${formatMoney(ch.difference)}` : `refunded ${formatMoney({ ...ch.difference, amount: -ch.difference.amount })}`}` : ''}
            </Text>
          </View>
        ))}
        {b.exception ? (
          <View style={{ gap: 4 }}>
            <View style={styles.row}>
              <Text variant="label">Refund review</Text>
              <Badge label={EXCEPTION_STATUS_LABEL[b.exception.status]} tone={TONE[b.exception.status]} />
            </View>
            <Text variant="caption" tone="muted">{EXCEPTION_REASON_LABEL[b.exception.reasonCode]}</Text>
            {b.exception.refund && b.exception.refund.amount > 0 ? <Text variant="caption">{formatMoney(b.exception.refund)} back to your card.</Text> : null}
            {b.exception.decisionNote ? <Text variant="caption" tone="muted">{b.exception.decisionNote}</Text> : null}
          </View>
        ) : null}
        {canAsk ? (
          <View style={{ gap: space.sm }}>
            <Text variant="caption" tone="muted">Cancelled because of a cancelled flight, bad weather or an emergency? Send proof and we’ll review it.</Text>
            <Button title="Ask for a review" variant="outline" size="sm" onPress={() => setAsking(true)} />
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' } });
