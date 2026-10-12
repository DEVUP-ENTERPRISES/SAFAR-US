import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Check, Lock } from 'lucide-react-native';
import { Text, radius, space, useTheme } from '@catodrive/ui';
import type { StepStatus } from '@catodrive/core/web/features/host/trip-handover';

/** One numbered step of the host's pickup checklist; locked steps say why. */
export function HandoverStep({
  n,
  title,
  status,
  summary,
  lockedReason,
  showWhenLocked = false,
  onLayout,
  children,
}: {
  n: number;
  title: string;
  status: StepStatus;
  summary?: string;
  lockedReason?: string;
  showWhenLocked?: boolean;
  onLayout?: (y: number) => void;
  children?: ReactNode;
}) {
  const { c } = useTheme();
  const locked = status === 'locked';
  const dim = locked || status === 'na';
  const dot = status === 'done' ? { bg: c.success, fg: '#fff' } : status === 'active' ? { bg: c.primary, fg: c.primaryForeground } : { bg: c.muted, fg: c.mutedForeground };
  return (
    <View
      onLayout={onLayout ? (e) => onLayout(e.nativeEvent.layout.y) : undefined}
      style={{ borderRadius: radius.xl, borderWidth: 1, borderColor: status === 'active' ? c.primary : c.border, backgroundColor: dim ? c.subtle : c.card, padding: space.lg, gap: space.sm }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: dot.bg, alignItems: 'center', justifyContent: 'center' }}>
          {status === 'done' ? <Check size={14} color={dot.fg} /> : locked ? <Lock size={12} color={dot.fg} /> : <Text variant="small" style={{ color: dot.fg }}>{n}</Text>}
        </View>
        <Text variant="label" tone={dim ? 'muted' : 'default'} style={{ flex: 1 }}>{title}</Text>
        {status === 'na' ? <Text variant="caption" tone="muted">Not required</Text> : summary ? <Text variant="caption" tone="muted">{summary}</Text> : null}
      </View>
      {locked && lockedReason ? <Text variant="caption" tone="muted">{lockedReason}</Text> : null}
      {status !== 'na' && (!locked || showWhenLocked) && children ? (
        <View pointerEvents={locked ? 'none' : 'auto'} style={{ opacity: locked ? 0.5 : 1 }}>
          {children}
        </View>
      ) : null}
    </View>
  );
}
