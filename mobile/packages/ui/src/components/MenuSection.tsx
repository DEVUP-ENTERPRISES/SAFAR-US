import { StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import { space } from '../theme/tokens';
import { Card } from './Card';
import { Divider } from './Divider';
import { Text } from './Text';

/** A titled group of MenuRows inside one card, like the website's account menu. */
export function MenuSection({ title, children }: { title?: string; children: ReactNode }) {
  const rows = (Array.isArray(children) ? children : [children]).filter(Boolean);
  return (
    <View style={styles.wrap}>
      {title ? <Text variant="small" tone="muted" style={styles.title}>{title.toUpperCase()}</Text> : null}
      <Card padded={false}>
        {rows.map((row, i) => (
          <View key={i}>
            {i > 0 ? <Divider inset={56} /> : null}
            {row}
          </View>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  title: { paddingHorizontal: space.xs },
});
