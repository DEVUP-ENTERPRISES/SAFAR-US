import { Pressable, StyleSheet, View } from 'react-native';
import { Clock } from 'lucide-react-native';
import { BottomSheet, Text, useTheme, space } from '@catodrive/ui';
import { formatClock } from '@catodrive/core/web/lib/utils/format';
import { HALF_HOURS } from './times';

/** Pick a half-hour time of day. */
export function TimeSheet({ visible, title, value, onPick, onClose }: { visible: boolean; title: string; value: string; onPick: (t: string) => void; onClose: () => void }) {
  const { c } = useTheme();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <View style={styles.times}>
        {HALF_HOURS.map((t) => {
          const on = t === value;
          return (
            <Pressable
              key={t}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => onPick(t)}
              style={[styles.time, { borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary : c.card }]}
            >
              <Clock size={14} color={on ? c.primaryForeground : c.mutedForeground} />
              <Text variant="label" style={{ color: on ? c.primaryForeground : c.foreground }}>{formatClock(t)}</Text>
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  time: { minHeight: 44, width: '31%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 12 },
});
