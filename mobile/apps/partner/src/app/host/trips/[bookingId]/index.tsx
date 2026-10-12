import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Camera, Car, FileText, Gauge, IdCard, LifeBuoy, Receipt, ShieldCheck, Star, User } from 'lucide-react-native';
import { Button, Card, Chip, ErrorState, MenuRow, Screen, ScreenHeader, Section, Skeleton, Text, space, useConfirm, useTheme, useToast } from '@catodrive/ui';
import { ChatPanel, DamageReviewPanel, HandoverPanel, RequireAuth, ReviewPrompt, TrackingCard, openInAppBrowser, webUrl } from '@catodrive/core';
import { bookingApi } from '@catodrive/core/web/features/bookings/api';
import { TRIP_FINISHED, tripHeading } from '@catodrive/core/web/features/host/trip-handover';
import { hostTripsApi } from '@catodrive/core/web/features/host/trips.api';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { formatDate, formatMoney, kmToMiles, perKmToPerMile } from '@catodrive/core/web/lib/utils/format';
import { CheckInPanel } from '@/features/host/CheckInPanel';
import { CheckoutPanel } from '@/features/host/CheckoutPanel';
import { FileDamageClaim } from '@/features/host/FileDamageClaim';
import { GuestIdentityCard } from '@/features/host/GuestIdentityCard';
import { HandoverTimeline } from '@/features/host/HandoverTimeline';
import { HostDepositCard } from '@/features/host/HostDepositCard';
import { IncidentalsForm } from '@/features/host/IncidentalsForm';
import { TripDocumentsHistory } from '@/features/host/TripDocumentsHistory';

type Tab = 'details' | 'messages' | 'help';
const TABS: { key: Tab; label: string }[] = [
  { key: 'details', label: 'Details' },
  { key: 'messages', label: 'Messages' },
  { key: 'help', label: 'Help' },
];
const miles = (v: number) => `${kmToMiles(v).toLocaleString()} miles`;
const clock = (d: string) => new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** The website's /host/trips/[bookingId]: accept a request, run the handover, end the trip, and everything after. */
function HostTripDetail({ bookingId }: { bookingId: string }) {
  const { c } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('details');
  const q = useQuery({ queryKey: ['host-trip', bookingId], queryFn: () => hostTripsApi.one(bookingId) });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['host-trip', bookingId] });
    void qc.invalidateQueries({ queryKey: ['host-trips'] });
  };
  const refreshRequest = () => {
    invalidate();
    void qc.invalidateQueries({ queryKey: ['host-bookings'] });
    void qc.invalidateQueries({ queryKey: ['host-inbox'] });
  };
  const toTrips = () => router.replace('/host/trips');

  const acceptRequest = useMutation({
    meta: { silentError: true },
    mutationFn: () => bookingApi.confirm(bookingId),
    onSuccess: () => {
      refreshRequest();
      toast({ tone: 'success', title: 'Booking accepted', body: 'The guest has been told and the trip is on your calendar.' });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not accept this request' }),
  });
  const declineRequest = useMutation({
    meta: { silentError: true },
    mutationFn: () => bookingApi.decline(bookingId),
    onSuccess: () => {
      refreshRequest();
      toast({ tone: 'success', title: 'Request declined' });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not decline this request' }),
  });
  const cancelBooking = useMutation({
    mutationFn: (reason: string) => bookingApi.cancel(bookingId, reason),
    onSuccess: () => {
      invalidate();
      toTrips();
    },
  });
  const guestNoShow = useMutation({
    meta: { silentError: true },
    mutationFn: () => bookingApi.noShow(bookingId, 'guest'),
    onSuccess: () => {
      invalidate();
      toast({ tone: 'success', title: 'Guest no-show recorded' });
      toTrips();
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not record the no-show' }),
  });

  const header = <ScreenHeader title="Trip" onBack={() => (router.canGoBack() ? router.back() : toTrips())} />;
  if (q.isPending) return <Screen header={header}><Skeleton height={320} /></Screen>;
  const t = q.data;
  if (q.isError || !t) return <Screen header={header}><ErrorState message="Trip not found." onRetry={() => void q.refetch()} /></Screen>;

  const cur = t.currency;
  const unlimited = t.mileage.includedKm === 0;
  const started = t.status === 'in_progress';
  const finished = TRIP_FINISHED.includes(t.status);

  const doDecline = async () => {
    const { ok } = await confirm({
      title: 'Decline this request?',
      description: 'The guest’s card hold is released and they’re shown other cars for these dates. Declining often lowers your ranking in search.',
      confirmLabel: 'Decline',
      tone: 'destructive',
    });
    if (ok) declineRequest.mutate();
  };
  const doGuestNoShow = async () => {
    const { ok } = await confirm({
      title: 'Report that the guest didn’t show up?',
      description: 'The trip is cancelled and the guest forfeits part of what they paid; you earn your share of that through your normal payout. The rest is refunded to the guest. This cannot be undone.',
      confirmLabel: 'Report no-show',
      tone: 'destructive',
    });
    if (ok) guestNoShow.mutate();
  };
  const doHostCancel = async () => {
    let desc: ReactNode = 'The guest is fully refunded and this counts against your standing.';
    try {
      const p = await bookingApi.cancellationPreview(t.bookingId);
      desc = `The guest will be refunded ${formatMoney(p.refund)} in full.${p.hostPenalty?.affectsStanding ? ` ${p.hostPenalty.note}` : ''}`;
    } catch {
      /* generic copy */
    }
    const { ok, reason } = await confirm({
      title: 'Cancel this booking?',
      description: desc,
      confirmLabel: 'Cancel booking',
      tone: 'destructive',
      reason: { label: 'Reason (shared with our team)', placeholder: 'e.g. Vehicle issue', required: true },
    });
    if (ok) cancelBooking.mutate(reason);
  };

  return (
    <Screen header={header} onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ width: 64, height: 48, borderRadius: 8, overflow: 'hidden', backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
          {t.vehicle.photoUrl ? (
            <Image source={{ uri: t.vehicle.photoUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          ) : (
            <Text variant="label" style={{ color: 'rgba(255,255,255,0.7)' }}>{t.vehicle.make.slice(0, 1)}{t.vehicle.model.slice(0, 1)}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="title">{tripHeading(t.status)}</Text>
          <Text tone="muted">{t.guest.name}</Text>
        </View>
      </View>

      {t.status === 'pending_approval' ? (
        <Card style={{ borderColor: c.warning, backgroundColor: c.warningSoft }}>
          <Text variant="heading">{t.guest.name} wants to book your {t.vehicle.make} {t.vehicle.model}</Text>
          <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
            {formatDate(t.period.start)} – {formatDate(t.period.end)} · You earn {formatMoney({ amount: t.earnings, currency: cur })}. The guest’s card is already held; accepting charges it and confirms the trip.
          </Text>
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
            <View style={{ flex: 1 }}>
              <Button title="Accept" loading={acceptRequest.isPending} disabled={declineRequest.isPending} onPress={() => acceptRequest.mutate()} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Decline" variant="outline" loading={declineRequest.isPending} disabled={acceptRequest.isPending} onPress={() => void doDecline()} />
            </View>
          </View>
        </Card>
      ) : null}

      {t.returnAwaitingConfirmation && t.tripId ? (
        <CheckoutPanel
          t={t}
          mode="confirm"
          onDone={() => {
            invalidate();
            toast({ tone: 'success', title: 'Return confirmed' });
          }}
        />
      ) : null}

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {TABS.map((x) => <Chip key={x.key} label={x.label} selected={tab === x.key} onPress={() => setTab(x.key)} />)}
      </View>

      {tab === 'details' ? (
        <>
          <HandoverTimeline timeline={t.timeline} />
          <HostDepositCard bookingId={bookingId} />
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <View style={{ flex: 1 }}>
                <Text variant="heading">{formatDate(t.period.start)}</Text>
                <Text variant="caption" tone="muted">{clock(t.period.start)}</Text>
              </View>
              <Text tone="muted">→</Text>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text variant="heading">{formatDate(t.period.end)}</Text>
                <Text variant="caption" tone="muted">{clock(t.period.end)}</Text>
              </View>
            </View>
          </Card>

          {!started ? <GuestIdentityCard bookingId={bookingId} /> : null}
          {!started && t.tripId ? (
            <Section title="Handover">
              <HandoverPanel tripId={t.tripId} role="host" />
            </Section>
          ) : null}
          <Section title="Location">
            <TrackingCard bookingId={t.bookingId} role="host" />
          </Section>
          <TripDocumentsHistory bookingId={t.bookingId} />

          <Section title="Your guest">
            <Card padded={false}>
              <MenuRow
                icon={
                  t.guest.avatarUrl ? (
                    <Image source={{ uri: t.guest.avatarUrl }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                  ) : (
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.muted, alignItems: 'center', justifyContent: 'center' }}>
                      <User size={18} color={c.mutedForeground} />
                    </View>
                  )
                }
                label={t.guest.name}
                value={`${t.guest.tripCount} trips · Joined ${new Date(t.guest.joinedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`}
                onPress={() => setTab('messages')}
                right={<Star size={16} color={c.mutedForeground} />}
              />
            </Card>
            <Button title="Contact guest" variant="outline" onPress={() => setTab('messages')} />
          </Section>

          <Section title="Trip info">
            <Card padded={false}>
              <MenuRow icon={<IdCard size={20} color={c.mutedForeground} />} label="Driver's licence" value={t.licenseConfirmed ? '✓ Checked against the guest’s verified ID' : 'Checked automatically from the guest’s verified ID when the trip starts'} />
              <MenuRow icon={<Camera size={20} color={c.mutedForeground} />} label={`Trip photos (${t.photoCount})`} value="Document condition before and after" onPress={() => router.push(`/host/trips/${t.bookingId}/photos`)} />
              <MenuRow icon={<Receipt size={20} color={c.mutedForeground} />} label="Total earnings" value={formatMoney({ amount: t.earnings, currency: cur })} onPress={() => router.push(`/host/trips/${t.bookingId}/receipt`)} />
              <MenuRow icon={<FileText size={20} color={c.mutedForeground} />} label="Cancellation policy" onPress={() => setTab('help')} />
            </Card>
          </Section>

          {(t.extensions?.length ?? 0) > 0 ? (
            <Section title="Extensions">
              <Card padded={false}>
                {t.extensions.map((e) => (
                  <MenuRow
                    key={e._id}
                    icon={<Receipt size={20} color={c.mutedForeground} />}
                    label={`+${e.days} day${e.days === 1 ? '' : 's'}, returns ${formatDate(e.newEnd)} (was ${formatDate(e.prevEnd)})`}
                    value={`+${formatMoney({ amount: e.hostEarnings, currency: cur })}`}
                  />
                ))}
              </Card>
            </Section>
          ) : null}

          <Section title="Mileage">
            <Card>
              <View style={{ gap: space.md }}>
                <View style={{ gap: 2 }}>
                  <View style={{ flexDirection: 'row' }}>
                    <Text variant="label" style={{ flex: 1 }}>Total distance included</Text>
                    <Text variant="label">{unlimited ? 'UNLIMITED' : miles(t.mileage.includedKm)}</Text>
                  </View>
                  <Text variant="caption" tone="muted">
                    {unlimited ? 'This car has unlimited mileage.' : `${t.guest.name} is charged ${formatMoney({ amount: perKmToPerMile(t.mileage.overageFeePerKm), currency: cur })} for every mile over the total included.`}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Gauge size={18} color={c.mutedForeground} />
                  <Text variant="label" style={{ flex: 1 }}>Distance driven</Text>
                  <Text variant="label">{t.mileage.drivenKm != null ? miles(t.mileage.drivenKm) : '-'}</Text>
                </View>
              </View>
            </Card>
          </Section>

          <Section title="About the car">
            <Card padded={false}>
              <MenuRow icon={<Car size={20} color={c.mutedForeground} />} label={`${t.vehicle.make} ${t.vehicle.model} ${t.vehicle.year || ''}`} value="View listing" onPress={() => router.push(`/host/listings/${t.vehicle._id}`)} />
              <MenuRow label="Licence plate number" value={t.vehicle.plate ?? '-'} />
            </Card>
          </Section>

          {finished && t.tripId ? (
            <View style={{ gap: space.lg }}>
              <DamageReviewPanel tripId={t.tripId} canRun />
              <IncidentalsForm bookingId={t.bookingId} />
              <ReviewPrompt bookingId={t.bookingId} role="host" subjectName={t.guest.name} />
              <FileDamageClaim bookingId={t.bookingId} tripId={t.tripId} currency={cur} />
            </View>
          ) : null}

          {!finished && started && t.tripId && !t.returnAwaitingConfirmation ? (
            <CheckoutPanel
              t={t}
              mode="end"
              onDone={() => {
                invalidate();
                toTrips();
              }}
            />
          ) : null}
          {!finished && !started ? <CheckInPanel t={t} onChanged={invalidate} /> : null}

          {t.status === 'paid' && !t.tripId && new Date(t.period.start).getTime() < Date.now() ? (
            <Button title="Guest didn’t show up" variant="outline" loading={guestNoShow.isPending} onPress={() => void doGuestNoShow()} />
          ) : null}
          {!finished && !started ? <Button title="Cancel this booking" variant="ghost" loading={cancelBooking.isPending} onPress={() => void doHostCancel()} /> : null}
        </>
      ) : null}

      {tab === 'messages' ? (
        <View style={{ gap: space.md }}>
          <Text variant="caption" tone="muted">
            Coordinate pickup, drop-off and any changes with <Text variant="caption" style={{ fontWeight: '600' }}>{t.guest.name}</Text>.
          </Text>
          <ChatPanel bookingId={t.bookingId} height={480} />
        </View>
      ) : null}

      {tab === 'help' ? (
        <>
          <Card>
            <Text variant="heading">Get help</Text>
            <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>Help centre and contact support</Text>
            <Button title="Get help" icon={<LifeBuoy size={16} color={c.primaryForeground} />} style={{ marginTop: space.md }} onPress={() => router.push('/support')} />
          </Card>
          <Section title="Policy">
            <Card padded={false}>
              <MenuRow icon={<FileText size={20} color={c.mutedForeground} />} label="Cancellation policy" value="Trip cancellation penalties and where exceptions apply" onPress={() => router.push('/support')} />
            </Card>
          </Section>
          <Section title="Protection">
            <Card padded={false}>
              <MenuRow
                icon={<ShieldCheck size={20} color={c.mutedForeground} />}
                label="Protection plan"
                value={`Confirm the licence and take pre-trip photos to stay covered · ${t.licenseConfirmed && t.photoCount > 0 ? 'Covered' : 'Action needed'}`}
              />
            </Card>
          </Section>
          <Section title="Report">
            <Card padded={false}>
              <MenuRow icon={<ShieldCheck size={20} color={c.destructive} />} label="Report damage" value="Open a claim with photo evidence" destructive onPress={() => void openInAppBrowser(webUrl(`/claims?booking=${t.bookingId}`))} />
            </Card>
          </Section>
        </>
      ) : null}
    </Screen>
  );
}

export default function HostTripScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  return (
    <RequireAuth>
      <HostTripDetail bookingId={bookingId} />
    </RequireAuth>
  );
}
