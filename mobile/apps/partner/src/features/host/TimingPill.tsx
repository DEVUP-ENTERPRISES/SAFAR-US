import { View } from 'react-native';
import { Text, useTheme } from '@catodrive/ui';
import type { TripTimingTone } from '@catodrive/core/web/features/host/trip-timing';

/** Trip timing pill: green = starting, red = ending, muted = ended. */
export function TimingPill({ tone, label }: { tone: TripTimingTone; label: string }) {
  const { c } = useTheme();
  const palette: Record<TripTimingTone, { bg: string; fg: string }> = {
    start: { bg: c.successSoft, fg: c.success },
    complete: { bg: c.successSoft, fg: c.success },
    end: { bg: c.destructiveSoft, fg: c.destructive },
    live: { bg: c.primarySoft, fg: c.primary },
    done: { bg: 'transparent', fg: c.mutedForeground },
    off: { bg: c.muted, fg: c.mutedForeground },
    warn: { bg: c.warningSoft, fg: c.warning },
  };
  const p = palette[tone];
  return (
    <View style={{ alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: p.bg }}>
      <Text variant="label" style={{ color: p.fg }}>{label}</Text>
    </View>
  );
}
