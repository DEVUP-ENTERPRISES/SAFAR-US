import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/theme';
import { space } from '../theme/tokens';
import { Text } from './Text';

export interface BarDatum {
  label: string;
  value: number;
}

/**
 * One series of bars against a zero baseline (negative months drop below it).
 * Tap a bar to read its exact value; the latest bar is selected to start.
 * Every bar carries an accessibility label, so the numbers are never colour-only.
 */
export function BarChart({ data, format, height = 140 }: { data: BarDatum[]; format: (v: number) => string; height?: number }) {
  const { c } = useTheme();
  const [selected, setSelected] = useState(data.length - 1);
  if (!data.length) return null;
  const max = Math.max(0, ...data.map((d) => d.value));
  const min = Math.min(0, ...data.map((d) => d.value));
  const span = max - min || 1;
  const above = (max / span) * height;
  const below = height - above;
  const pick = data[Math.min(selected, data.length - 1)];

  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.readout} accessibilityLiveRegion="polite">
        <Text variant="caption" tone="muted">{pick.label}</Text>
        <Text variant="heading">{format(pick.value)}</Text>
      </View>
      <View style={{ height, flexDirection: 'row', alignItems: 'stretch', gap: 2 }}>
        {data.map((d, i) => {
          const h = (Math.abs(d.value) / span) * height;
          const on = i === selected;
          const color = on ? c.primary : c.primarySoft;
          return (
            <Pressable
              key={`${d.label}-${i}`}
              accessibilityRole="button"
              accessibilityLabel={`${d.label}: ${format(d.value)}`}
              accessibilityState={{ selected: on }}
              onPress={() => setSelected(i)}
              hitSlop={{ top: 8, bottom: 8 }}
              style={{ flex: 1 }}
            >
              <View style={{ height: above, justifyContent: 'flex-end' }}>
                {d.value > 0 ? <View style={{ height: Math.max(2, h), backgroundColor: color, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} /> : null}
              </View>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />
              <View style={{ height: below }}>
                {d.value < 0 ? <View style={{ height: Math.max(2, h), backgroundColor: on ? c.destructive : c.destructiveSoft, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 }} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 2 }}>
        {data.map((d, i) => (
          <Text key={`l-${i}`} variant="small" tone={i === selected ? 'default' : 'muted'} center style={{ flex: 1 }} numberOfLines={1}>
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
});
