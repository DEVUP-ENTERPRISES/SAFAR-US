import { View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Receipt } from 'lucide-react-native';
import { Badge, Button, Card, Divider, Text, useConfirm, useTheme, useToast, space } from '@catodrive/ui';
import { openInAppBrowser } from '@catodrive/core';
import { bookingApi } from '@catodrive/core/web/features/bookings/api';
import { INCIDENTAL_LABEL } from '@catodrive/core/web/features/bookings/status';
import type { Booking } from '@catodrive/core/web/features/bookings/types';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { formatDate, formatMoney } from '@catodrive/core/web/lib/utils/format';

type Incidental = NonNullable<Booking['incidentals']>[number];

/** Charges after the trip (fuel, tolls, late return…), each with its evidence and a way to dispute it. */
export function IncidentalCharges({ bookingId, items, currency }: { bookingId: string; items: Incidental[]; currency: string }) {
  const { c } = useTheme();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const dispute = useMutation({
    meta: { silentError: true },
    mutationFn: ({ id, why }: { id: string; why: string }) => bookingApi.disputeIncidental(bookingId, id, why),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Dispute sent', body: 'We will review it and come back to you.' });
      void qc.invalidateQueries({ queryKey: ['booking', bookingId] });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not send that' }),
  });
  if (!items.length) return null;
  const total = items.filter((i) => i.status !== 'refunded').reduce((s, i) => s + i.amount, 0);

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Receipt size={18} color={c.primary} />
        <Text variant="heading" style={{ flex: 1 }}>Post-trip charges</Text>
        <Text variant="heading">{formatMoney({ amount: total, currency })}</Text>
      </View>
      {items.map((it, i) => (
        <View key={it._id} style={{ gap: 4, marginTop: space.md }}>
          {i > 0 ? <Divider /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
            <Text variant="label" style={{ flex: 1 }}>{INCIDENTAL_LABEL[it.type] ?? it.type}</Text>
            {it.status === 'disputed' ? <Badge label="Under review" tone="warning" /> : null}
            {it.status === 'refunded' ? <Badge label="Refunded" tone="success" /> : null}
            {it.status === 'upheld' ? <Badge label="Upheld" /> : null}
            <Text variant="label">{formatMoney({ amount: it.amount, currency })}</Text>
          </View>
          {it.note ? <Text variant="caption" tone="muted">{it.note}</Text> : null}
          <Text variant="caption" tone="muted">{formatDate(it.at)}</Text>
          {it.resolutionNote ? <Text variant="caption">{it.resolutionNote}</Text> : null}
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {it.evidenceUrl ? <Button title="Evidence" size="sm" variant="outline" full={false} onPress={() => void openInAppBrowser(it.evidenceUrl!)} /> : null}
            {it.status === 'charged' ? (
              <Button
                title="Dispute"
                size="sm"
                variant="ghost"
                full={false}
                loading={dispute.isPending && dispute.variables?.id === it._id}
                onPress={async () => {
                  const { ok, reason } = await confirm({
                    title: 'Dispute this charge?',
                    description: 'Tell us what is wrong with it. Our team reviews every dispute and the charge stays on hold until then.',
                    confirmLabel: 'Send dispute',
                    reason: { label: 'What’s wrong with this charge?', required: true },
                  });
                  if (ok) dispute.mutate({ id: it._id, why: reason });
                }}
              />
            ) : null}
          </View>
        </View>
      ))}
    </Card>
  );
}
