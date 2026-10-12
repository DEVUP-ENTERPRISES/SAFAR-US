import { StyleSheet, View } from 'react-native';
import { MapPinOff, Navigation, ShieldAlert } from 'lucide-react-native';
import { Badge, Card, Text, useTheme, space } from '@catodrive/ui';
import { useTrackingState } from '../web/features/trips/hooks';
import { useLocationStreaming } from '../location-streaming';

/** Whether location is being shared on this trip right now, and why; streams this phone's position when it should. */
export function TrackingCard({ bookingId, role }: { bookingId: string; role: 'guest' | 'host' }) {
  const { c } = useTheme();
  const q = useTrackingState(bookingId);
  const t = q.data;
  useLocationStreaming(bookingId, !!t?.trackingEnabled && t.broadcasters.includes(role));
  if (!t) return null;
  if (!t.trackingEnabled && role === 'guest') return null;
  const opensAt = t.opensAt ? new Date(t.opensAt) : null;

  if (!t.trackingEnabled) {
    return (
      <Card>
        <View style={styles.row}>
          <MapPinOff size={20} color={c.mutedForeground} />
          <View style={{ flex: 1 }}>
            <Text variant="label">{t.phase === 'in_trip' ? 'Location is off during the trip' : 'Location sharing is not on'}</Text>
            <Text variant="caption" tone="muted">
              {t.phase === 'in_trip'
                ? 'You can see the trip status, not where the car is. Location comes back on shortly before the return so you can meet your guest.'
                : opensAt
                  ? `Sharing starts around ${opensAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}, close to the handover.`
                  : 'Nothing is being shared for this trip.'}
            </Text>
          </View>
        </View>
      </Card>
    );
  }

  return (
    <Card>
      <View style={styles.row}>
        {t.isException ? <ShieldAlert size={20} color={c.warning} /> : <Navigation size={20} color={c.success} />}
        <View style={{ flex: 1 }}>
          <Text variant="label">{t.isException ? 'Location is being shared' : t.phase === 'return' ? 'Sharing location for the drop-off' : 'Sharing location for the handover'}</Text>
          {t.reason ? <Text variant="caption" tone="muted">{t.reason}</Text> : null}
        </View>
        <Badge label={t.isException ? t.exceptionKind ?? 'exception' : 'Live'} tone={t.isException ? 'warning' : 'success'} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
});
