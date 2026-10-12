import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Lock, ShieldCheck } from 'lucide-react-native';
import { Card, Text, space, useTheme } from '@catodrive/ui';
import { depositsApi } from '@catodrive/core/web/features/payments/deposits-api';
import { formatMoney } from '@catodrive/core/web/lib/utils/format';

/** The guest's security deposit as the host sees it: held or not, and what that means for starting the trip. */
export function HostDepositCard({ bookingId }: { bookingId: string }) {
  const { c } = useTheme();
  const q = useQuery({ queryKey: ['deposit', bookingId], queryFn: () => depositsApi.get(bookingId), retry: false });
  const d = q.data;
  if (!d || d.enabled === false || !d.amount || d.amount.amount <= 0) return null;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        {d.held ? <ShieldCheck size={18} color={c.success} /> : <Lock size={18} color={c.mutedForeground} />}
        <Text variant="heading">Security deposit {formatMoney(d.amount)}</Text>
      </View>
      <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>
        {d.held
          ? 'Held on the guest’s card. You can start the trip.'
          : 'Not held yet. With a saved card it is held automatically when you start the trip; otherwise the guest places it from their booking, and is alerted if you try to start without it.'}
      </Text>
    </Card>
  );
}
