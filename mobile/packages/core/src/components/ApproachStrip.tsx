import { StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Car, CheckCircle2, Clock, KeyRound, MapPin, Send } from 'lucide-react-native';
import { Button, Skeleton, Text, radius, space, useTheme, useToast } from '@catodrive/ui';
import { tripApi, type ApproachLeg } from '../web/features/trips/api';
import { SecureImage } from './SecureImage';

const clock = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null);

/** The website's approach strip: who has set off, who has arrived, and how to find the car. */
export function ApproachStrip({ bookingId, role }: { bookingId: string; role: 'guest' | 'host' }) {
  const { c } = useTheme();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['approach', bookingId], queryFn: () => tripApi.approach(bookingId), refetchInterval: 45_000, retry: false });
  const onWay = useMutation({
    mutationFn: () => tripApi.onMyWay(bookingId),
    onSuccess: () => {
      toast({ tone: 'success', title: 'They have been told you are on the way' });
      void qc.invalidateQueries({ queryKey: ['approach', bookingId] });
    },
    onError: () => toast({ tone: 'error', title: 'Could not send that' }),
    meta: { silentError: true },
  });

  if (q.isLoading) return <Skeleton height={120} round={radius.lg} />;
  if (q.isError || !q.data) return null;

  const mine: ApproachLeg = role === 'guest' ? q.data.guest : q.data.host;
  const theirs: ApproachLeg = role === 'guest' ? q.data.host : q.data.guest;
  const them = role === 'guest' ? 'Your host' : 'Your guest';
  const pickup = q.data.pickup;
  const Icon = theirs.arrivedAt ? CheckCircle2 : theirs.onWayAt ? Car : Clock;
  const iconColor = theirs.arrivedAt ? c.success : theirs.onWayAt ? c.primary : c.mutedForeground;

  return (
    <View style={{ gap: space.md }}>
      <View style={styles.row}>
        <Icon size={20} color={iconColor} />
        <View style={{ flex: 1 }}>
          <Text variant="label">{theirs.arrivedAt ? `${them} is here` : theirs.onWayAt ? `${them} is on the way` : `${them} has not set off yet`}</Text>
          <Text variant="caption" tone="muted">
            {theirs.arrivedAt
              ? `Arrived at ${clock(theirs.arrivedAt)}.`
              : theirs.onWayAt
                ? theirs.etaAt
                  ? `Expected around ${clock(theirs.etaAt)}. You will be told if that changes - no need to check.`
                  : 'Working out their arrival time.'
                : 'You will be notified the moment they set off.'}
          </Text>
        </View>
      </View>

      {!mine.onWayAt ? (
        <Button title="I'm on my way" icon={<Send size={16} color={c.primaryForeground} />} loading={onWay.isPending} onPress={() => onWay.mutate()} />
      ) : (
        <View style={[styles.note, { backgroundColor: c.muted }]}>
          <CheckCircle2 size={16} color={c.success} />
          <Text variant="caption" tone="muted" style={{ flex: 1 }}>
            {mine.arrivedAt ? `You arrived at ${clock(mine.arrivedAt)}.` : `You told them you set off at ${clock(mine.onWayAt)}.`}
          </Text>
        </View>
      )}

      {role === 'guest' && pickup && (pickup.instructions || pickup.spotPhotoUrl || pickup.accessCode) ? (
        <View style={[styles.find, { borderTopColor: c.border }]}>
          <View style={styles.row}>
            <MapPin size={16} color={c.primary} />
            <Text variant="label">Finding the car</Text>
          </View>
          {pickup.instructions ? <Text variant="caption" tone="muted">{pickup.instructions}</Text> : null}
          {pickup.spotPhotoUrl ? <SecureImage url={pickup.spotPhotoUrl} style={styles.photo} alt="Where the car is parked" /> : null}
          {pickup.accessCode ? (
            <View style={[styles.note, { backgroundColor: c.primarySoft }]}>
              <KeyRound size={16} color={c.primary} />
              <Text variant="caption">
                Access code <Text variant="label" style={{ letterSpacing: 2 }}>{pickup.accessCode}</Text>
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  note: { flexDirection: 'row', gap: space.sm, alignItems: 'center', borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  find: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.md, gap: space.sm },
  photo: { width: '100%', height: 160, borderRadius: radius.lg },
});
