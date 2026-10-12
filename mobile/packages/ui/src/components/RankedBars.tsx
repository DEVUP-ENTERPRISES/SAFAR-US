import { View } from 'react-native';
import { useTheme } from '../theme/theme';
import { space } from '../theme/tokens';
import { Text } from './Text';

/** Labelled horizontal bars scaled to the largest value; the value is printed beside each label, never colour-only. */
export function RankedBars({ data, format }: { data: { label: string; value: number }[]; format: (v: number) => string }) {
  const { c } = useTheme();
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={{ gap: space.md }}>
      {data.map((d, i) => (
        <View key={`${d.label}-${i}`} style={{ gap: 4 }} accessible accessibilityLabel={`${d.label}: ${format(d.value)}`}>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Text variant="caption" numberOfLines={1} style={{ flex: 1 }}>{d.label}</Text>
            <Text variant="caption" style={{ fontWeight: '600' }}>{format(d.value)}</Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: c.muted, overflow: 'hidden' }}>
            <View style={{ width: `${Math.max(2, Math.round((d.value / max) * 100))}%`, height: '100%', borderRadius: 4, backgroundColor: c.primary }} />
          </View>
        </View>
      ))}
    </View>
  );
}
