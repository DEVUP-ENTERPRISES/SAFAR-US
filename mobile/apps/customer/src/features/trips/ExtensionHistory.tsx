import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarPlus } from 'lucide-react-native';
import { Card, Divider, Text, useTheme, space } from '@catodrive/ui';
import type { BookingExtension } from '@catodrive/core/web/features/bookings/types';
import { formatDateTime, formatMoney } from '@catodrive/core/web/lib/utils/format';

/** Every extension on the trip, each with its own receipt. */
export function ExtensionHistory({ bookingId, extensions }: { bookingId: string; extensions?: BookingExtension[] }) {
  const { c } = useTheme();
  const router = useRouter();
  if (!extensions?.length) return null;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
        <CalendarPlus size={18} color={c.primary} />
        <Text variant="heading">Extensions</Text>
      </View>
      {extensions.map((e, i) => (
        <View key={e._id} style={{ gap: 2, paddingVertical: space.sm }}>
          {i > 0 ? <Divider /> : null}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}>
            <Text variant="label" style={{ flex: 1 }}>+{e.days} day{e.days === 1 ? '' : 's'} · returns {formatDateTime(e.newEnd)}</Text>
            <Text variant="label">{formatMoney(e.total)}</Text>
          </View>
          <Text variant="caption" tone="muted">Was {formatDateTime(e.prevEnd)} · {formatDateTime(e.createdAt)}</Text>
          <Text variant="caption" tone="primary" onPress={() => router.push(`/bookings/${bookingId}/receipt`)}>Receipt {e.receiptNo}</Text>
        </View>
      ))}
    </Card>
  );
}
