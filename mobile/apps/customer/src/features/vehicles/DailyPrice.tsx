import { View } from 'react-native';
import { Badge, Text, type TypeVariant } from '@catodrive/ui';
import { formatMoney } from '@catodrive/core/web/lib/utils/format';
import { useMemberDailyPrice } from '@catodrive/core/web/features/subscriptions/hooks';

/** A car's daily price; members see their own price with the normal one struck through, like the website. */
export function DailyPrice({ amount, currency, variant = 'title' }: { amount: number; currency: string; variant?: TypeVariant }) {
  const member = useMemberDailyPrice(amount);
  if (!member) return <Text variant={variant}>{formatMoney({ amount, currency })}</Text>;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
      <Text variant={variant} tone="warning">{formatMoney({ amount: member.price, currency })}</Text>
      <Text variant="caption" tone="muted" style={{ textDecorationLine: 'line-through' }}>{formatMoney({ amount, currency })}</Text>
      <Badge label={`−${(member.discountBps / 100).toFixed(0)}%`} tone="warning" />
    </View>
  );
}
