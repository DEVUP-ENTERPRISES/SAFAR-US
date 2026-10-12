import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme/theme';
import { space } from '../theme/tokens';
import { Card } from './Card';
import { Text } from './Text';

/** One headline figure with its label and a short note; `tone` colours only the small marker, never the number. */
export function StatTile({ label, value, sub, icon, tone, onPress }: { label: string; value: string; sub?: string; icon?: ReactNode; tone?: 'success' | 'warning'; onPress?: () => void }) {
  const { c } = useTheme();
  return (
    <Card onPress={onPress} accessibilityLabel={`${label}: ${value}${sub ? `, ${sub}` : ''}`} style={{ flex: 1, minWidth: '46%' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {tone ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone === 'success' ? c.success : c.warning }} /> : null}
        <Text variant="caption" tone="muted" style={{ flex: 1 }} numberOfLines={1}>{label}</Text>
        {icon}
      </View>
      <Text variant="title" style={{ marginTop: space.xs }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sub ? <Text variant="caption" tone="muted" numberOfLines={2}>{sub}</Text> : null}
    </Card>
  );
}
