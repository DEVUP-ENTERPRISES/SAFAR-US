import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Info, Landmark, Lock, ShieldCheck } from 'lucide-react-native';
import { Button, Card, Text, useTheme, useToast, space } from '@catodrive/ui';
import { depositsApi } from '@catodrive/core/web/features/payments/deposits-api';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { formatDate, formatDateTime, formatMoney } from '@catodrive/core/web/lib/utils/format';
import { usePayments } from '@/features/payments/usePayments';

/**
 * The trip's security deposit: placing the hold before pickup, then what
 * happened to it after the trip. The website's DepositCard and DepositStatus in one.
 */
export function DepositCard({ bookingId, canPlace }: { bookingId: string; canPlace: boolean }) {
  const { c } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const payments = usePayments();
  const q = useQuery({ queryKey: ['deposit', bookingId], queryFn: () => depositsApi.get(bookingId), retry: false });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['deposit', bookingId] });

  const place = useMutation({
    meta: { silentError: true },
    mutationFn: async () => {
      const s = await depositsApi.session(bookingId);
      if (s.status === 'needs_payment') {
        const r = await payments.payIntent(s.clientSecret);
        if (!r.ok) return r.cancelled ? 'cancelled' : 'failed';
        const after = await depositsApi.session(bookingId);
        return after.status === 'held' ? 'held' : 'failed';
      }
      if (s.status === 'too_early') {
        toast({ tone: 'info', title: `You can place it from ${formatDateTime(s.opensAt)}` });
        return 'early';
      }
      return 'held';
    },
    onSuccess: (outcome) => {
      if (outcome === 'held') toast({ tone: 'success', title: 'Deposit held. You are ready for pickup.' });
      if (outcome === 'failed') toast({ tone: 'error', title: 'The deposit hold didn’t go through. Please try again.' });
      refresh();
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not start the deposit' }),
  });

  const d = q.data;
  if (!d || d.enabled === false || !d.amount || d.amount.amount <= 0) return null;
  const days = Math.round((d.releaseHours ?? 120) / 24);
  const captured = d.captured?.amount ?? 0;
  const released = d.status === 'released';
  const placeable = canPlace && !d.held && !released && captured === 0 && (!d.opensAt || new Date(d.opensAt).getTime() <= Date.now());

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        {d.held || released ? <ShieldCheck size={18} color={c.success} /> : captured > 0 ? <Landmark size={18} color={c.warning} /> : <Lock size={18} color={c.mutedForeground} />}
        <Text variant="heading">Security deposit {formatMoney(d.amount)}</Text>
      </View>
      <View style={{ gap: space.sm, marginTop: space.sm }}>
        {captured > 0 ? (
          <>
            <Text>
              {formatMoney(d.captured!)} taken from your {formatMoney(d.amount)} deposit{captured < d.amount.amount ? ' - the rest was released' : ''}
            </Text>
            {d.reason ? (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Info size={14} color={c.mutedForeground} />
                <Text variant="caption" tone="muted" style={{ flex: 1 }}>{d.reason}</Text>
              </View>
            ) : null}
          </>
        ) : released ? (
          <Text variant="caption" tone="success">Released in full. Nothing was taken{d.settledAt ? ` - released ${formatDate(d.settledAt)}.` : '.'}</Text>
        ) : d.held ? (
          <>
            <Text variant="caption" tone="muted">Held on your card, not charged. Your bank shows it as pending and it does not leave your account.</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Clock size={14} color={c.mutedForeground} />
              <Text variant="caption" tone="muted" style={{ flex: 1 }}>Released about {days} days after your trip unless there is a damage claim.</Text>
            </View>
          </>
        ) : (
          <>
            <Text variant="caption" tone="muted">A hold, not a charge, placed before pickup and released about {days} days after your trip.{d.requiredAtHandover ? ' The trip cannot start without it.' : ''}</Text>
            {!placeable && d.opensAt ? <Text variant="caption" tone="muted">With a saved card this is done for you at pickup. Otherwise you can place it from {formatDateTime(d.opensAt)}.</Text> : null}
          </>
        )}
        {placeable ? <Button title="Place deposit hold" size="sm" full={false} loading={place.isPending} onPress={() => place.mutate()} /> : null}
      </View>
    </Card>
  );
}
