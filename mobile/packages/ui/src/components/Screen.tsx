import { KeyboardAvoidingView, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';
import { useTheme } from '../theme/theme';
import { space } from '../theme/tokens';

export interface ScreenProps {
  children: ReactNode;
  /** Scrollable body (default). Pass false for screens that manage their own list. */
  scroll?: boolean;
  /** Pull-to-refresh: called on pull, spinner shown while `refreshing`. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Fixed area under the content (primary action), kept above the keyboard. */
  footer?: ReactNode;
  header?: ReactNode;
  edges?: Edge[];
  padded?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}

/** Every screen's frame: safe areas, keyboard avoidance, scroll and pull-to-refresh. */
export function Screen({ children, scroll = true, onRefresh, refreshing = false, footer, header, edges = ['top', 'left', 'right'], padded = true, contentStyle }: ScreenProps) {
  const { c } = useTheme();
  const pad = padded ? { padding: space.lg, gap: space.lg } : null;
  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: c.background }]}>
      {header}
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        {scroll ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[pad, styles.grow, contentStyle]}
            keyboardShouldPersistTaps="handled"
            refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} colors={[c.primary]} /> : undefined}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.flex, pad, contentStyle]}>{children}</View>
        )}
        {footer ? (
          <SafeAreaView edges={['bottom']} style={[styles.footer, { backgroundColor: c.background, borderTopColor: c.border }]}>
            {footer}
          </SafeAreaView>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.md, borderTopWidth: StyleSheet.hairlineWidth, gap: space.sm },
});
