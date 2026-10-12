import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/theme';
import { radius, space } from '../theme/tokens';
import { Text } from './Text';

/** One choice in a list of options (protection plan, payment method): title, detail and a price or note. */
export function RadioCard({ selected, onPress, title, detail, aside }: { selected: boolean; onPress: () => void; title: string; detail?: string; aside?: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={[title, aside, detail].filter(Boolean).join(', ')}
      onPress={onPress}
      style={[styles.card, { borderColor: selected ? c.primary : c.border, backgroundColor: selected ? c.primarySoft : c.card }]}
    >
      <View style={[styles.dot, { borderColor: selected ? c.primary : c.input }]}>{selected ? <View style={[styles.inner, { backgroundColor: c.primary }]} /> : null}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.top}>
          <Text variant="label" style={{ flex: 1 }}>{title}</Text>
          {aside ? <Text variant="label">{aside}</Text> : null}
        </View>
        {detail ? <Text variant="caption" tone="muted">{detail}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', borderWidth: 1.5, borderRadius: radius.lg, padding: space.md },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  inner: { width: 10, height: 10, borderRadius: 5 },
  top: { flexDirection: 'row', gap: space.sm, alignItems: 'baseline' },
});
