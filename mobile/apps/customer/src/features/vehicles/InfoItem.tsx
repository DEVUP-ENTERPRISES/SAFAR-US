import { StyleSheet, View } from 'react-native';
import { Text, useTheme, space } from '@catodrive/ui';

/** An icon, a heading and a line of detail: the website's "Peace of mind" rows and policy blocks. */
export function InfoItem({ icon: Icon, title, detail, children }: { icon: React.ComponentType<{ size?: number; color?: string }>; title: string; detail?: string; children?: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: c.primarySoft }]}>
        <Icon size={18} color={c.primary} />
      </View>
      <View style={styles.body}>
        <Text variant="label">{title}</Text>
        {detail ? <Text variant="caption" tone="muted">{detail}</Text> : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
});
