import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { Image } from 'expo-image';
import { Camera, Check, Clock, ShieldCheck } from 'lucide-react-native';
import { Badge, Card, Skeleton, Text, useTheme, useToast, radius, space } from '@catodrive/ui';
import { tripApi, type InspectionAngle, type PhotoPhase } from '../web/features/trips/api';
import { useInspection } from '../web/features/trips/hooks';
import { formatDateTime } from '../web/lib/utils/format';
import { ApiError } from '../web/lib/api/types';
import { pickPhotos, uploadPhotos } from '../uploads';
import { safeMessage } from '../web/lib/utils/safe-message';

const GROUPS = [
  { id: 'walkaround', title: 'Walk-around' },
  { id: 'outside', title: 'Outside details' },
  { id: 'inside', title: 'Inside' },
  { id: 'id', title: 'ID & existing damage' },
] as const;

/**
 * Pickup or return condition photos, angle by angle. Photos come only from the
 * camera, carry the time and (when required) the place, and can't be changed
 * afterwards: the same baseline the website records.
 */
export function InspectionPhotos({ bookingId, phase }: { bookingId: string; phase: PhotoPhase }) {
  const router = useRouter();
  const { c } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: state, isPending } = useInspection(bookingId);
  const [busy, setBusy] = useState<string | null>(null);

  if (isPending || !state) return <Skeleton height={220} />;
  const win = state[phase];
  const angles = state.angles;
  const taken = state.photos.filter((p) => p.phase === phase);
  const shotsOf = (id: string) => taken.filter((p) => p.angle === id);
  const needOf = (a: InspectionAngle) => a.shots ?? 1;
  const canShoot = win.open && taken.length < win.max;
  const enough = taken.length >= win.required;
  const title = phase === 'pre' ? 'Pickup photos' : 'Return photos';
  const status = win.open
    ? win.closesAt && phase === 'pre' && state.tripId
      ? `Open until ${formatDateTime(win.closesAt)}.`
      : null
    : win.reason === 'not_yet'
      ? `Photos open ${formatDateTime(win.opensAt)}.`
      : win.reason === 'no_trip'
        ? 'Return photos open once the trip has started.'
        : 'This photo window is closed.';

  const shoot = async (angle: InspectionAngle) => {
    setBusy(angle.id);
    try {
      let fix: { lat: number; lng: number; accuracyM: number } | undefined;
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.granted) {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
        if (pos) fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy ?? 0 };
      }
      if (state.requireLocation && !fix) {
        toast({ tone: 'error', title: 'Location is needed for these photos', body: 'Allow location for CatoDrive in Settings, then try again.' });
        return;
      }
      const shot = await pickPhotos('camera');
      if (!shot?.length) return;
      const capturedAt = new Date().toISOString();
      const [uploaded] = await uploadPhotos('trip_photo', shot.slice(0, 1));
      await tripApi.addPhotos(bookingId, phase, [
        { url: uploaded.url, key: uploaded.key, angle: angle.id, capturedAtClient: capturedAt, sha256: uploaded.sha256, ...(fix ?? {}) },
      ]);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['inspection', bookingId] }),
        qc.invalidateQueries({ queryKey: ['trip'] }),
        qc.invalidateQueries({ queryKey: ['host-trip'] }),
      ]);
    } catch (err) {
      toast({ tone: 'error', title: err instanceof ApiError || err instanceof Error ? safeMessage(err.message) : 'That photo didn’t save. Try again.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <View style={styles.head}>
        <ShieldCheck size={18} color={c.primary} />
        <Text variant="heading" style={{ flex: 1 }}>{title}</Text>
        <Badge label={`${taken.length}${win.required > 0 ? ` / ${win.required} needed` : ''}`} tone={enough ? 'success' : 'primary'} />
      </View>
      <Text variant="caption" tone="muted">{angles.length} shots, about five minutes. Start at the front and walk counterclockwise so nothing gets skipped.</Text>
      <Text variant="caption" tone="muted">
        {phase === 'pre' ? 'Take them before you drive off.' : 'Take them as you return the car.'} Photos are taken live, stamped with the time and place, and can’t be changed afterwards.
      </Text>
      {status ? (
        <View style={[styles.status, { backgroundColor: c.muted }]}>
          <Clock size={14} color={c.mutedForeground} />
          <Text variant="caption" tone="muted">{status}</Text>
        </View>
      ) : null}
      {GROUPS.map((g) => {
        const cards = angles.filter((a) => (a.group ?? 'walkaround') === g.id);
        if (!cards.length) return null;
        return (
          <View key={g.id} style={{ gap: space.sm, marginTop: space.md }}>
            <Text variant="label">{g.title} · {cards.length} shots{g.id === 'walkaround' ? ', counterclockwise' : ''}</Text>
            <View style={styles.grid}>
              {cards.map((a) => {
                const number = angles.indexOf(a) + 1;
                const shots = shotsOf(a.id);
                const need = needOf(a);
                const done = need > 0 && shots.length >= need;
                const canAdd = canShoot && (need === 0 || shots.length < need);
                return (
                  <Pressable
                    key={a.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${number}. ${a.label}${done ? ', done' : ''}`}
                    disabled={!canAdd || !!busy}
                    onPress={() => void shoot(a)}
                    style={[styles.tile, { borderColor: done ? c.success : c.border, backgroundColor: c.card, opacity: canAdd || done ? 1 : 0.6 }]}
                  >
                    {shots[0] ? <Image source={{ uri: shots[0].url }} style={styles.thumb} contentFit="cover" /> : (
                      <View style={[styles.thumb, styles.placeholder, { backgroundColor: c.muted }]}>
                        {busy === a.id ? <ActivityIndicator color={c.primary} /> : <Camera size={22} color={c.mutedForeground} />}
                      </View>
                    )}
                    <View style={styles.tileText}>
                      <View style={[styles.num, { backgroundColor: done ? c.success : c.muted }]}>
                        {done ? <Check size={12} color="#fff" /> : <Text variant="small" tone="muted">{number}</Text>}
                      </View>
                      <Text variant="caption" numberOfLines={2} style={{ flex: 1 }}>{a.label}</Text>
                    </View>
                    {a.hint ? <Text variant="small" tone="muted" numberOfLines={2}>{a.hint}</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
      <View style={{ gap: 4, marginTop: space.md }}>
        <Text variant="caption" tone="muted">Left and right are as if you were sitting in the driver’s seat. Card numbers match the shooting order.</Text>
        <Text variant="caption" tone="primary" accessibilityRole="link" onPress={() => router.push('/help/photo-guide' as never)}>Why each shot matters</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.md, padding: space.sm, marginTop: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { width: '48%', borderWidth: 1.5, borderRadius: radius.lg, padding: space.sm, gap: 6 },
  thumb: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  tileText: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  num: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
