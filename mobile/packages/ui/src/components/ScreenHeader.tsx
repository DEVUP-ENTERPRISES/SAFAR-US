import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTheme } from '../theme/theme';
import { space, TOUCH } from '../theme/tokens';
import { Text } from './Text';

export interface ScreenHeaderProps {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
  large?: boolean;
}

export function ScreenHeader({ title, subtitle, onBack, right, large }: ScreenHeaderProps) {
  const { c } = useTheme();
  return (
    <View style={[styles.bar, large && styles.large]}>
      <View style={styles.row}>
        {onBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={8} style={styles.back} android_ripple={{ color: 'rgba(0,0,0,0.08)', borderless: true }}>
            <ChevronLeft size={26} color={c.foreground} />
          </Pressable>
        ) : null}
        <View style={styles.titles}>
          {title ? (
            <Text variant={large ? 'display' : 'heading'} numberOfLines={1} accessibilityRole="header">
              {title}
            </Text>
          ) : null}
          {subtitle ? <Text variant="caption" tone="muted" numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: space.sm, paddingVertical: space.xs, minHeight: TOUCH + 8, justifyContent: 'center' },
  large: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  back: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center', borderRadius: TOUCH / 2 },
  titles: { flex: 1, paddingHorizontal: space.xs },
  right: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
