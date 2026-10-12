import { StyleSheet, View } from 'react-native';
import { space } from '../theme/tokens';
import { Text } from './Text';

/** A label on the left and its value on the right, for receipts and details. */
export function KeyValue({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'success' | 'destructive' | 'muted' }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant={strong ? 'label' : 'body'} tone={strong ? 'default' : 'muted'} style={styles.label}>{label}</Text>
      <Text variant={strong ? 'heading' : 'body'} tone={tone ?? 'default'} style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md, alignItems: 'baseline' },
  label: { flex: 1 },
  value: { textAlign: 'right', flexShrink: 0, maxWidth: '60%' },
});
