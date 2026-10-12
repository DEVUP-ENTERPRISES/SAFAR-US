import { View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text, space, useTheme } from '@catodrive/ui';
import { APPLICATION_STAGES } from '@catodrive/core/web/features/asset-partners/status';

/** Submitted → Under review → Approved → Earning, with the current stage filled. */
export function StageTrack({ current }: { current: number }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row' }} accessibilityLabel={`Stage ${current + 1} of ${APPLICATION_STAGES.length}: ${APPLICATION_STAGES[current]}`}>
      {APPLICATION_STAGES.map((stage, i) => {
        const done = i < current;
        const active = i === current;
        const bg = done ? c.successSoft : active ? c.primary : c.muted;
        const fg = done ? c.success : active ? c.primaryForeground : c.mutedForeground;
        return (
          <View key={stage} style={{ flex: 1, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
                {done ? <Check size={14} color={fg} /> : <Text variant="small" style={{ color: fg }}>{i + 1}</Text>}
              </View>
              {i < APPLICATION_STAGES.length - 1 ? <View style={{ flex: 1, height: 2, marginHorizontal: 4, backgroundColor: done ? c.success : c.border }} /> : null}
            </View>
            <Text variant="small" tone={active ? 'default' : 'muted'} numberOfLines={2} style={{ paddingRight: space.xs }}>{stage}</Text>
          </View>
        );
      })}
    </View>
  );
}
