import { View } from 'react-native';
import { Check, Lock } from 'lucide-react-native';
import { Card, Text, space, useTheme } from '@catodrive/ui';
import type { TimelineStep } from '@catodrive/core/web/features/host/trips.api';

/** The handover steps in order; renders nothing when the backend sends no timeline. */
export function HandoverTimeline({ timeline }: { timeline?: TimelineStep[] | null }) {
  const { c } = useTheme();
  if (!timeline || timeline.length === 0) return null;
  return (
    <Card>
      {timeline.map((s, i) => {
        const muted = s.state === 'todo' || s.state === 'locked';
        const dot = s.state === 'done' ? { bg: c.success, fg: '#fff', border: c.success } : s.state === 'current' ? { bg: c.primary, fg: c.primaryForeground, border: c.primary } : { bg: c.muted, fg: c.mutedForeground, border: c.border };
        return (
          <View key={s.key} style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ alignItems: 'center' }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: dot.border, backgroundColor: dot.bg, alignItems: 'center', justifyContent: 'center' }}>
                {s.state === 'done' ? <Check size={14} color={dot.fg} /> : s.state === 'locked' ? <Lock size={12} color={dot.fg} /> : <Text variant="small" style={{ color: dot.fg }}>{i + 1}</Text>}
              </View>
              {i < timeline.length - 1 ? <View style={{ width: 1, flex: 1, minHeight: 12, backgroundColor: c.border }} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: i < timeline.length - 1 ? space.md : 0, gap: 2 }}>
              <Text variant="label" tone={s.state === 'current' ? 'primary' : muted ? 'muted' : 'default'}>{s.label}</Text>
              {s.detail && (s.state === 'current' || s.state === 'locked') ? <Text variant="caption" tone="muted">{s.detail}</Text> : null}
            </View>
          </View>
        );
      })}
    </Card>
  );
}
