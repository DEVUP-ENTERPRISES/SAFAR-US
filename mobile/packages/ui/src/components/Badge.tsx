import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/theme';
import { radius } from '../theme/tokens';
import { Text } from './Text';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'destructive';

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const { c } = useTheme();
  const { bg, fg } = {
    neutral: { bg: c.muted, fg: c.mutedForeground },
    primary: { bg: c.primarySoft, fg: c.primary },
    success: { bg: c.successSoft, fg: c.success },
    warning: { bg: c.warningSoft, fg: c.warning },
    destructive: { bg: c.destructiveSoft, fg: c.destructive },
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text variant="small" style={{ color: fg }}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
});
