import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BottomSheet, Button, DateRangeCalendar, Text, useTheme, space } from '@catodrive/ui';
import { formatClock } from '@catodrive/core/web/lib/utils/format';
import { HALF_HOURS } from '@/features/search/times';

/** Pick one day and a half-hour time; returns a local "YYYY-MM-DDTHH:mm" like the website's datetime field. */
export function DateTimeSheet({ visible, title, earliest, initial, onPick, onClose }: { visible: boolean; title: string; earliest?: Date; initial?: string; onPick: (local: string) => void; onClose: () => void }) {
  const { c } = useTheme();
  const [day, setDay] = useState('');
  const [time, setTime] = useState('10:00');
  useEffect(() => {
    if (!visible) return;
    setDay(initial?.slice(0, 10) ?? '');
    setTime(initial?.slice(11, 16) || '10:00');
  }, [visible, initial]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} footer={<Button title="Done" disabled={!day} onPress={() => onPick(`${day}T${time}`)} />}>
      <DateRangeCalendar single from={day} to="" earliest={earliest} onChange={(f) => setDay(f)} />
      <Text variant="label">Time</Text>
      <View style={styles.times}>
        {HALF_HOURS.map((t) => {
          const on = t === time;
          return (
            <Pressable key={t} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setTime(t)} style={[styles.time, { borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary : c.card }]}>
              <Text variant="caption" style={{ color: on ? c.primaryForeground : c.foreground }}>{formatClock(t)}</Text>
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  time: { minHeight: 40, width: '23%', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 10, marginBottom: 2 },
});
