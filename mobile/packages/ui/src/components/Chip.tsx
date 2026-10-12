import { Pressable, StyleSheet } from 'react-native';
import type { ReactNode } from 'react';
import { useTheme } from '../theme/theme';
import { radius, space } from '../theme/tokens';
import { Text } from './Text';

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: ReactNode }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      android_ripple={{ color: 'rgba(0,0,0,0.06)', borderless: false }}
      style={[styles.chip, { backgroundColor: selected ? c.ink : c.card, borderColor: selected ? c.ink : c.border }]}
      hitSlop={4}
    >
      {icon}
      <Text variant="label" style={{ color: selected ? c.inkForeground : c.foreground }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { minHeight: 40, paddingHorizontal: space.lg, borderRadius: radius.pill, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
});
