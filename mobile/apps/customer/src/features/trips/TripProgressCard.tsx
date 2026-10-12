import { StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Button, Card, Text, useTheme, space } from '@catodrive/ui';
import { TRIP_STAGE, TRIP_STEPS } from '@catodrive/core/web/features/bookings/status';

/** The trip, step by step, with the current step and the next one explained. */
export function TripProgressCard({ status, pickupAt, onVerify }: { status: string; pickupAt: string; onVerify: () => void }) {
  const { c } = useTheme();
  const stage = TRIP_STAGE[status];
  if (stage === undefined) return null;
  const current = stage >= TRIP_STEPS.length ? -1 : stage;
  return (
    <Card>
      <Text variant="heading">Your trip, step by step</Text>
      <Text variant="caption" tone="muted">Pickup {new Date(pickupAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text>
      <View style={{ marginTop: space.md }}>
        {TRIP_STEPS.map((s, i) => {
          const done = i < stage;
          const isCurrent = i === current;
          return (
            <View key={s.title} style={styles.step}>
              <View style={styles.rail}>
                <View style={[styles.dot, done ? { backgroundColor: c.primary, borderColor: c.primary } : isCurrent ? { backgroundColor: c.primarySoft, borderColor: c.primary } : { borderColor: c.border }]}>
                  {done ? <Check size={14} color={c.primaryForeground} /> : <Text variant="small" tone={isCurrent ? 'primary' : 'muted'}>{i + 1}</Text>}
                </View>
                {i < TRIP_STEPS.length - 1 ? <View style={[styles.line, { backgroundColor: done ? c.primary : c.border }]} /> : null}
              </View>
              <View style={styles.body}>
                <Text variant="label" tone={done || isCurrent ? 'default' : 'muted'}>{s.title}</Text>
                {isCurrent || (!done && i === current + 1) ? <Text variant="caption" tone="muted">{s.detail}</Text> : null}
                {isCurrent && i === 1 ? <Button title="Verify identity" size="sm" full={false} onPress={onVerify} style={{ marginTop: space.sm }} /> : null}
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', gap: space.md },
  rail: { alignItems: 'center', width: 28 },
  dot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  line: { width: 2, flex: 1, minHeight: 14 },
  body: { flex: 1, paddingBottom: space.md, gap: 2 },
});
