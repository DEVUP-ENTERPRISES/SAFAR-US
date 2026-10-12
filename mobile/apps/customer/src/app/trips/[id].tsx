import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Camera, CheckCircle2, Fuel, Gauge, KeyRound, Leaf, MapPin, ShieldAlert, TreePine } from 'lucide-react-native';
import {
  Badge, Button, Card, ErrorState, Input, Screen, ScreenHeader, Section, Skeleton, Text, useTheme, useToast, radius, space,
} from '@catodrive/ui';
import { ChatPanel, DamageReviewPanel, HandoverPanel, IncidentReport, InspectionPhotos, RequireAuth, ReviewPrompt, TrackingCard } from '@catodrive/core';
import { tripApi } from '@catodrive/core/web/features/trips/api';
import { useCheckIn, useCompleteTrip, useSos, useTrip } from '@catodrive/core/web/features/trips/hooks';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { formatDate, kmToMiles } from '@catodrive/core/web/lib/utils/format';
import { TripDocumentsCard } from '@/features/trips/TripDocumentsCard';

function Metric({ icon: Icon, label, value }: { icon: React.ComponentType<{ size?: number; color?: string }>; label: string; value: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.metric, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon size={14} color={c.mutedForeground} />
        <Text variant="caption" tone="muted">{label}</Text>
      </View>
      <Text variant="label" style={{ textTransform: 'capitalize' }}>{value}</Text>
    </View>
  );
}

/** The website's /trips/[id]: check in, return photos and readings, complete, SOS, incidents, documents and chat. */
function TripDashboard({ id }: { id: string }) {
  const { c } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const { data: trip, isPending, isError, refetch, isRefetching } = useTrip(id);
  const checkIn = useCheckIn(id);
  const complete = useCompleteTrip(id);
  const sos = useSos(id);
  const [damage, setDamage] = useState('');
  const [odoEnd, setOdoEnd] = useState('');
  const [fuelEnd, setFuelEnd] = useState('');
  const [reporting, setReporting] = useState(false);

  const header = <ScreenHeader title="Your trip" onBack={() => (router.canGoBack() ? router.back() : router.replace('/bookings'))} />;
  if (isPending) return <Screen header={header}><Skeleton height={200} /></Screen>;
  if (isError || !trip) return <Screen header={header}><ErrorState message="Trip not found." onRetry={() => void refetch()} /></Screen>;

  const returnPhotos = (trip.photos ?? []).filter((p) => p.phase === 'post').length;
  const post = trip.inspection?.post;
  const minReturn = post?.required ?? 0;
  const loc = trip.liveLocation;
  const isActive = trip.status === 'active';
  const isCompleted = trip.status === 'completed';

  const onSos = () =>
    sos.mutate(undefined, { onSuccess: () => toast({ tone: 'success', title: 'SOS sent. Help is on the way.' }), onError: () => toast({ tone: 'error', title: 'Could not send. Call 911 or support now.' }) });

  return (
    <Screen header={header} onRefresh={() => void refetch()} refreshing={isRefetching}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text variant="title">Your trip</Text>
            <Text variant="caption" tone="muted">Started {formatDate(trip.handover.at)}</Text>
          </View>
          <Badge label={trip.status} tone={isActive ? 'primary' : isCompleted ? 'success' : 'destructive'} />
        </View>
        {isActive ? (
          <View style={{ gap: space.sm, marginTop: space.md }}>
            {!trip.checkin ? (
              <Button title="Check-in now" icon={<KeyRound size={18} color={c.primaryForeground} />} loading={checkIn.isPending} onPress={() => checkIn.mutate()} />
            ) : (
              <Button
                title="Complete trip"
                icon={<CheckCircle2 size={18} color={c.primaryForeground} />}
                loading={complete.isPending}
                disabled={returnPhotos < minReturn}
                accessibilityHint={returnPhotos < minReturn ? `Take at least ${minReturn} return photos first` : undefined}
                onPress={() =>
                  complete.mutate(
                    { odometerEnd: odoEnd ? Number(odoEnd) : undefined, fuelEnd: fuelEnd ? Number(fuelEnd) : undefined },
                  )
                }
              />
            )}
            <Button title="SOS" variant="destructive" icon={<ShieldAlert size={18} color={c.destructiveForeground} />} loading={sos.isPending} onPress={onSos} />
          </View>
        ) : null}
        {isCompleted && trip.returnConfirmed === false ? (
          <View style={{ marginTop: space.md }}>
            <Text variant="label">Waiting for your host to confirm</Text>
            <Text variant="caption" tone="muted">Your deposit is released once your host confirms the car came back.</Text>
          </View>
        ) : null}
      </Card>

      {isActive && post?.open && returnPhotos < minReturn ? (
        <Card style={{ borderColor: c.primary }}>
          <Text variant="label">Take your return photos</Text>
          <Text variant="caption" tone="muted">Your return time is close. Photograph the car from every side ({returnPhotos} of {minReturn} needed).</Text>
        </Card>
      ) : null}
      {isActive && !trip.checkin ? <HandoverPanel tripId={trip._id} role="guest" /> : null}
      {isActive ? <IncidentReport tripId={trip._id} /> : null}
      {isActive ? <TripDocumentsCard bookingId={trip.bookingId} /> : null}
      <TrackingCard bookingId={trip.bookingId} role="guest" />
      <DamageReviewPanel tripId={trip._id} canRun={false} />

      <Section title="Trip details">
        <View style={styles.metrics}>
          <Metric icon={KeyRound} label="Check-in" value={trip.checkin ? trip.checkin.method.replace(/_/g, ' ') : 'Pending'} />
          <Metric icon={Gauge} label="Distance" value={`${trip.distanceKm} km`} />
          <Metric icon={Fuel} label="Fuel start" value={trip.handover.fuelStart != null ? `${trip.handover.fuelStart}%` : '-'} />
          <Metric icon={MapPin} label="Location" value={loc ? `${loc.coordinates[1].toFixed(3)}, ${loc.coordinates[0].toFixed(3)}` : 'No signal'} />
        </View>
      </Section>

      {trip.carbon ? (
        <Section title="Sustainability">
          <View style={styles.metrics}>
            <Metric icon={Fuel} label="CO₂ emitted" value={`${trip.carbon.emittedKg} kg`} />
            <Metric icon={Leaf} label="CO₂ saved" value={`${trip.carbon.savedKg} kg`} />
            <Metric icon={TreePine} label="Trees / yr" value={`${trip.carbon.treesEquivalent}`} />
            <Metric icon={Gauge} label="Distance" value={`${kmToMiles(trip.carbon.distanceKm)} miles`} />
          </View>
        </Section>
      ) : null}

      {isCompleted ? <ReviewPrompt bookingId={trip.bookingId} role="guest" /> : null}

      {isActive && trip.checkin ? (
        <Section title="Return details">
          <Input label="Ending odometer (miles)" keyboardType="number-pad" value={odoEnd} onChangeText={(t) => setOdoEnd(t.replace(/\D/g, ''))} placeholder={trip.handover.odometerStart != null ? `≥ ${trip.handover.odometerStart}` : 'e.g. 41250'} />
          <Input label="Fuel level (%)" keyboardType="number-pad" maxLength={3} value={fuelEnd} onChangeText={(t) => setFuelEnd(t.replace(/\D/g, ''))} placeholder="e.g. 80" />
          {returnPhotos < minReturn ? (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Camera size={14} color={c.warning} />
              <Text variant="caption" tone="warning" style={{ flex: 1 }}>Take at least {minReturn} return photos below to complete the trip ({returnPhotos} taken).</Text>
            </View>
          ) : null}
        </Section>
      ) : null}

      <Section title="Pickup condition">
        <InspectionPhotos bookingId={trip.bookingId} phase="pre" />
      </Section>
      {isActive || (trip.photos ?? []).some((p) => p.phase === 'post') ? (
        <Section title="Return condition">
          <InspectionPhotos bookingId={trip.bookingId} phase="post" />
        </Section>
      ) : null}

      <Section title="Report damage">
        <Input value={damage} onChangeText={setDamage} placeholder="Describe any damage…" multiline />
        <Button
          title="Report"
          icon={<Camera size={18} color={c.primaryForeground} />}
          disabled={!damage.trim()}
          loading={reporting}
          onPress={async () => {
            setReporting(true);
            try {
              await tripApi.reportDamage(id, damage.trim(), []);
              setDamage('');
              void refetch();
            } catch (e) {
              toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not report that' });
            } finally {
              setReporting(false);
            }
          }}
        />
        {trip.damageReports.map((d, i) => (
          <View key={i} style={[styles.report, { borderColor: c.border }]}>
            <Text style={{ flex: 1 }}>{d.description}</Text>
            <Text variant="caption" tone="muted">{formatDate(d.at)}</Text>
          </View>
        ))}
      </Section>

      <ChatPanel bookingId={trip.bookingId} />
    </Screen>
  );
}

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireAuth>
      <TripDashboard id={id} />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  metric: { width: '48%', borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space.md, gap: 4 },
  report: { flexDirection: 'row', gap: space.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: space.md },
});
