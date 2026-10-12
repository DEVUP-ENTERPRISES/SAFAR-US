import { memo, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/theme';
import { radius, space } from '../theme/tokens';
import { Text } from './Text';

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** A local calendar date as YYYY-MM-DD. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export interface DateRangeCalendarProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  /** First selectable day (defaults to today). */
  earliest?: Date;
  /** Days that can't be picked (booked or blocked). A range may not cross one. */
  unavailable?: Set<string>;
  /** Optional small label under each day, like the price for that night. */
  labelFor?: (key: string) => string | undefined;
}

/**
 * The website's two-tap range picker, one month at a time: tap a start, tap an
 * end. Tapping the same day again, or a day before the start, restarts.
 */
export const DateRangeCalendar = memo(function DateRangeCalendar({ from, to, onChange, earliest, unavailable, labelFor }: DateRangeCalendarProps) {
  const { c } = useTheme();
  const today = useMemo(() => {
    const d = earliest ? new Date(earliest) : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, [earliest]);
  const [offset, setOffset] = useState(0);
  const [anchor, setAnchor] = useState<string | null>(null);

  const month = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const pad = month.getDay();
  const label = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const minKey = dayKey(today);

  const crossesBlocked = (a: string, b: string) => {
    if (!unavailable?.size) return false;
    for (const k of unavailable) if (k >= a && k <= b) return true;
    return false;
  };

  const pick = (key: string) => {
    void Haptics.selectionAsync().catch(() => undefined);
    if (!anchor) {
      setAnchor(key);
      onChange(key, '');
      return;
    }
    if (key <= anchor || crossesBlocked(anchor, key)) {
      setAnchor(key);
      onChange(key, '');
      return;
    }
    onChange(anchor, key);
    setAnchor(null);
  };

  const cells: (number | null)[] = [...Array.from({ length: pad }, () => null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous month" disabled={offset === 0} onPress={() => setOffset((o) => Math.max(0, o - 1))} hitSlop={8} style={[styles.nav, { borderColor: c.border, opacity: offset === 0 ? 0.3 : 1 }]}>
          <ChevronLeft size={18} color={c.foreground} />
        </Pressable>
        <Text variant="heading" accessibilityRole="header">{label}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" disabled={offset >= 11} onPress={() => setOffset((o) => Math.min(11, o + 1))} hitSlop={8} style={[styles.nav, { borderColor: c.border, opacity: offset >= 11 ? 0.3 : 1 }]}>
          <ChevronRight size={18} color={c.foreground} />
        </Pressable>
      </View>
      <View style={styles.row}>
        {DOW.map((d) => (
          <Text key={d} variant="small" tone="muted" style={styles.dow}>{d}</Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((n, i) => {
          if (!n) return <View key={i} style={styles.cell} />;
          const key = dayKey(new Date(month.getFullYear(), month.getMonth(), n));
          const past = key < minKey;
          const blocked = unavailable?.has(key) ?? false;
          const disabled = past || blocked;
          const isEnd = key === from || key === to;
          const inRange = !!from && !!to && key > from && key < to;
          const sub = !disabled ? labelFor?.(key) : undefined;
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={`${n} ${label}${blocked ? ', unavailable' : ''}`}
              accessibilityState={{ disabled, selected: isEnd }}
              disabled={disabled}
              onPress={() => pick(key)}
              style={[styles.cell, inRange && { backgroundColor: c.primarySoft }]}
            >
              <View style={[styles.day, isEnd && { backgroundColor: c.primary }]}>
                <Text
                  variant="label"
                  style={{
                    color: isEnd ? c.primaryForeground : disabled ? c.mutedForeground : c.foreground,
                    opacity: disabled ? 0.4 : 1,
                    textDecorationLine: blocked ? 'line-through' : 'none',
                  }}
                >
                  {n}
                </Text>
                {sub ? <Text variant="small" style={{ color: isEnd ? c.primaryForeground : c.mutedForeground, fontSize: 9 }}>{sub}</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs },
  nav: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row' },
  dow: { flex: 1, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  day: { width: '88%', height: '88%', borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
