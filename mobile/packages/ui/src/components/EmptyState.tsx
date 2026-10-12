import { StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import { useTheme } from '../theme/theme';
import { space } from '../theme/tokens';
import { Text } from './Text';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, body, actionLabel, onAction }: EmptyStateProps) {
  const { c } = useTheme();
  return (
    <View style={styles.wrap}>
      {icon ? <View style={[styles.icon, { backgroundColor: c.primarySoft }]}>{icon}</View> : null}
      <Text variant="heading" center>{title}</Text>
      {body ? <Text tone="muted" center>{body}</Text> : null}
      {actionLabel && onAction ? <Button title={actionLabel} onPress={onAction} full={false} style={{ alignSelf: 'center', marginTop: space.sm }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: space.xxxl, paddingHorizontal: space.xl },
  icon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
});
