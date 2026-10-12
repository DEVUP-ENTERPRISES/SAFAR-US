import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTheme } from '../theme/theme';
import { space, TOUCH } from '../theme/tokens';
import { Text } from './Text';

export interface MenuRowProps {
  icon?: ReactNode;
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  right?: ReactNode;
}

export function MenuRow({ icon, label, value, onPress, destructive, right }: MenuRowProps) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={value ? `${label}, ${value}` : label}
      onPress={onPress}
      disabled={!onPress}
      android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.subtle }]}
    >
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text variant="label" tone={destructive ? 'destructive' : 'default'} style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {value ? <Text variant="caption" tone="muted" numberOfLines={1} style={styles.value}>{value}</Text> : null}
      {right ?? (onPress ? <ChevronRight size={18} color={c.mutedForeground} /> : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: TOUCH + 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, gap: space.md },
  icon: { width: 24, alignItems: 'center' },
  label: { flex: 1 },
  value: { maxWidth: '45%' },
});
