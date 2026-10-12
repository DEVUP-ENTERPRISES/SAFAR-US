import { StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import { space } from '../theme/tokens';
import { Text } from './Text';

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text variant="heading" accessibilityRole="header" style={styles.title}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { flex: 1 },
});
