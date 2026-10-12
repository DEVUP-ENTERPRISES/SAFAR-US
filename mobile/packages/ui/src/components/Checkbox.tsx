import { Pressable, StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTheme } from '../theme/theme';
import { space, TOUCH } from '../theme/tokens';
import { Text } from './Text';

/** A tappable row with a check box: the whole row toggles, not just the box. */
export function Checkbox({ checked, onChange, label, children, right }: { checked: boolean; onChange: (next: boolean) => void; label?: string; children?: ReactNode; right?: ReactNode }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => onChange(!checked)}
      style={styles.row}
      hitSlop={4}
    >
      <View style={[styles.box, { borderColor: checked ? c.primary : c.input, backgroundColor: checked ? c.primary : c.card }]}>
        {checked ? <Check size={16} color={c.primaryForeground} strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1 }}>{children ?? <Text>{label}</Text>}</View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: TOUCH - 4, flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: space.xs },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
});
