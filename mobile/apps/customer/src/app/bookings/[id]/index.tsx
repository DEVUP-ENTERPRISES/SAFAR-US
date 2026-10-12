import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Car, Lock, MapPin, Receipt, ShieldCheck, Shuffle, XCircle } from 'lucide-react-native';
import { Image } from 'expo-image';
import { Badge, Button, Card, ErrorState, KeyValue, Screen, ScreenHeader, Skeleton, Text, useConfirm, useTheme, useToast, radius, space, type BadgeTone } from '@catodrive/ui';
import { ChatPanel, InspectionPhotos, RequireAuth, TrackingCard, PushPrompt, openInAppBrowser, webUrl } from '@catodrive/core';
import { bookingApi } from '@catodrive/core/web/features/bookings/api';
import { BOOKING_STATE, CHATTABLE, DETAIL_CANCELLABLE } from '@catodrive/core/web/features/bookings/status';
import { claimsApi } from '@catodrive/core/web/features/claims/api';
import { vehicleApi } from '@catodrive/core/web/features/vehicles/api';
import { usePlatformConfig } from '@catodrive/core/web/features/platform/config';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { formatDateTime, formatMoney } from '@catodrive/core/web/lib/utils/format';
import { useCompletePayment } from '@/features/payments/useCompletePayment';
import { ExtendTrip } from '@/features/bookings/ExtendTrip';
import { BookingReadiness } from '@/features/account/BookingReadiness';
import { DepositCard } from '@/features/trips/DepositCard';
import { IncidentalCharges } from '@/features/trips/IncidentalCharges';
import { ExtensionHistory } from '@/features/trips/ExtensionHistory';
import { PickupCodeCard } from '@/features/trips/PickupCodeCard';
import { SwapOfferCard } from '@/features/trips/SwapOfferCard';
import { TripDocumentsCard } from '@/features/trips/TripDocumentsCard';
import { TripProgressCard } from '@/features/trips/TripProgressCard';

const TONE: Record<string, BadgeTone> = { default: 'primary', success: 'success', warning: 'warning', destructive: 'destructive', muted: 'neutral' };

function BookingDetail({ id }: { id: string }) {
  const { c } = useTheme();
  const qc = useQueryClient();
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const cfg = usePlatformConfig().data;
  const cancellationUrl = cfg?.legal?.cancellationUrl || webUrl('/legal');

  const booking = useQuery({ queryKey: ['booking', id], queryFn: () => bookingApi.getById(id), retry: false });
  const vehicle = useQuery({ queryKey: ['vehicle', booking.data?.vehicleId], queryFn: () => vehicleApi.getById(booking.data!.vehicleId), enabled: !!booking.data?.vehicleId });
  const cancelPreview = useQuery({ queryKey: ['cancellation-preview', id], queryFn: () => bookingApi.cancellationPreview(id), enabled: !!booking.data && DETAIL_CANCELLABLE.includes(booking.data.status), retry: false });
  const settlement = useQuery({ queryKey: ['settlement', id], queryFn: () => claimsApi.settlement(id), enabled: booking.data?.status === 'completed', retry: false });

  const cancel = useMutation({
    meta: { silentError: true },
    mutationFn: (reason: string) => bookingApi.cancel(id, reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['booking', id] });
      void qc.invalidateQueries({ queryKey: ['bookings'] });
      toast({ tone: 'success', title: 'Booking cancelled' });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not cancel' }),
  });
  const noShow = useMutation({
    meta: { silentError: true },
    mutationFn: () => bookingApi.noShow(id, 'host'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['booking', id] });
      void qc.invalidateQueries({ queryKey: ['bookings'] });
      toast({ tone: 'success', title: 'Reported. Your refund is on its way.' });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not report the no-show' }),
  });
  const completePayment = useCompletePayment();

  if (booking.isPending) {
    return (
      <Screen header={<ScreenHeader title="Trip" onBack={() => router.back()} />}>
        <Skeleton height={220} />
        <Skeleton height={160} />
      </Screen>
    );
  }
  if (booking.isError || !booking.data) {
    return (
      <Screen header={<ScreenHeader title="Trip" onBack={() => router.back()} />}>
        <ErrorState message="We couldn’t find that booking." />
        <Button title="Back to my trips" variant="outline" onPress={() => router.replace('/bookings')} />
      </Screen>
    );
  }

  const b = booking.data;
  const state = BOOKING_STATE[b.status] ?? { tone: 'muted' as const, label: b.status, detail: '' };
  const v = vehicle.data;
  const p = b.priceBreakdown;
  const canCancel = DETAIL_CANCELLABLE.includes(b.status);
  const canReportNoShow = b.status === 'paid' && !b.tripId && new Date(b.period.start).getTime() < Date.now();

  const onCancel = async () => {
    const preview = await bookingApi.cancellationPreview(id).catch(() => null);
    const { ok, reason } = await confirm({
      title: 'Cancel this trip?',
      description: preview
        ? `You’d be refunded ${formatMoney(preview.refund)} of ${formatMoney(preview.total)}.${preview.nonRefundable.amount > 0 ? ` We will charge you ${formatMoney(preview.nonRefundable)} for this cancellation.` : ''} This cannot be undone.`
        : 'This cannot be undone.',
      confirmLabel: 'Cancel trip',
      tone: 'destructive',
      reason: { label: 'Reason', placeholder: 'e.g. Plans changed', required: true },
    });
    if (ok && reason) cancel.mutate(reason);
  };
  const onNoShow = async () => {
    const { ok } = await confirm({
      title: 'Report that the host didn’t show up?',
      description: `You’ll be refunded the full ${formatMoney(p.total)}, this trip will be cancelled, and we’ll offer you a replacement car. Only report this if you were at the pickup point and the host never arrived.`,
      confirmLabel: 'Report no-show',
      tone: 'destructive',
    });
    if (ok) noShow.mutate();
  };

  return (
    <Screen header={<ScreenHeader title="My trips" onBack={() => (router.canGoBack() ? router.back() : router.replace('/bookings'))} />} onRefresh={() => void booking.refetch()} refreshing={booking.isRefetching}>
      <Card padded={false}>
        {v?.photos?.[0]?.url ? (
          <Image source={{ uri: v.photos[0].url }} style={styles.cover} contentFit="cover" />
        ) : (
          <View style={[styles.cover, styles.noPhoto, { backgroundColor: c.muted }]}>
            <Car size={40} color={c.mutedForeground} />
          </View>
        )}
        <View style={{ padding: space.lg, gap: space.sm }}>
          <View style={styles.row}>
            <Badge label={state.label} tone={TONE[state.tone]} />
            <Text variant="caption" tone="muted">{b.code}</Text>
          </View>
          <Text variant="title">{v ? `${v.year} ${v.make} ${v.model}` : 'Loading…'}</Text>
          {v?.location?.city ? (
            <View style={styles.row}>
              <MapPin size={14} color={c.mutedForeground} />
              <Text variant="caption" tone="muted">{v.location.city}</Text>
            </View>
          ) : null}
          <Text tone="muted">{state.detail}</Text>
          <View style={styles.dates}>
            <View style={{ flex: 1 }}>
              <Text variant="small" tone="muted">PICK-UP</Text>
              <Text variant="label">{formatDateTime(b.period.start)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="small" tone="muted">RETURN</Text>
              <Text variant="label">{formatDateTime(b.period.end)}</Text>
            </View>
          </View>
          <View style={styles.buttons}>
            <Button title="View listing" size="sm" variant="outline" full={false} onPress={() => router.push(`/vehicles/${b.vehicleId}`)} />
            {b.status === 'pending_payment' ? <Button title="Complete payment" size="sm" full={false} loading={completePayment.isPending} onPress={() => completePayment.mutate(id)} /> : null}
            {b.status === 'cancelled_host' ? <Button title="Find a replacement car" size="sm" full={false} onPress={() => router.push(`/bookings/${id}/rebook`)} /> : null}
          </View>
        </View>
      </Card>

      {b.status === 'pending_verification' ? <BookingReadiness /> : null}
      {['paid', 'confirmed', 'in_progress', 'completed'].includes(b.status) ? <DepositCard bookingId={id} canPlace={['paid', 'confirmed'].includes(b.status)} /> : null}

      <PushPrompt detail="Turn on notifications to hear the moment your identity clears, your host replies, or your trip status changes." successBody="We’ll alert you about your trips." />

      <SwapOfferCard booking={b} />
      {b.swap ? (
        <Card>
          <View style={styles.row}>
            <Shuffle size={18} color={c.primary} />
            <Text variant="label" style={{ flex: 1 }}>Your trip moved to a similar car - same dates, same price</Text>
          </View>
          <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
            Another guest extended their trip on your original car, so we moved you to {v ? `${v.year} ${v.make} ${v.model}` : 'a comparable car'}. Your booking code, dates and total are unchanged.
          </Text>
        </Card>
      ) : null}

      <TripProgressCard status={String(b.status)} pickupAt={b.period.start} onVerify={() => router.push('/account/verify-identity')} />
      <TrackingCard bookingId={id} role="guest" />
      {b.status === 'in_progress' ? <TripDocumentsCard bookingId={id} /> : null}
      {['paid', 'confirmed', 'in_progress'].includes(String(b.status)) ? <PickupCodeCard bookingId={id} /> : null}
      {b.status === 'paid' && !b.tripId ? <InspectionPhotos bookingId={id} phase="pre" /> : null}

      <ExtensionHistory bookingId={id} extensions={b.extensions} />
      {['paid', 'in_progress'].includes(b.status) ? (
        <Card>
          <View style={[styles.row, { marginBottom: space.md }]}>
            <CalendarPlus size={18} color={c.primary} />
            <Text variant="heading">Extend your trip</Text>
          </View>
          <ExtendTrip booking={b} />
        </Card>
      ) : null}
      {b.incidentals?.length ? <IncidentalCharges bookingId={id} items={b.incidentals} currency={p.currency ?? 'USD'} /> : null}

      {b.delivery?.address || b.additionalDrivers?.length ? (
        <Card>
          <Text variant="heading" style={{ marginBottom: space.sm }}>Trip details</Text>
          {b.delivery?.address ? <KeyValue label="Delivered to" value={b.delivery.address} /> : null}
          {b.additionalDrivers?.length ? <KeyValue label="Additional drivers" value={b.additionalDrivers.map((d) => d.name).join(', ')} /> : null}
        </Card>
      ) : null}

      {b.status === 'completed' && settlement.data ? (
        <Card style={settlement.data.closed ? { borderColor: c.success } : undefined}>
          <View style={styles.row}>
            <Lock size={18} color={settlement.data.closed ? c.success : c.mutedForeground} />
            <Text variant="label" style={{ flex: 1 }}>
              {settlement.data.closed ? 'This trip is closed' : settlement.data.openClaims > 0 ? 'A claim is being reviewed' : 'Final checks'}
            </Text>
          </View>
          <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
            {settlement.data.closed
              ? 'No further charges can be made for this trip. You’re done.'
              : settlement.data.openClaims > 0
                ? 'We’ll let you know the outcome. Nothing is charged until it’s resolved.'
                : `Your host has ${settlement.data.hoursRemaining}h left to report any damage. After that, this trip can’t be charged again.`}
          </Text>
        </Card>
      ) : null}

      {CHATTABLE.includes(b.status) ? <ChatPanel bookingId={id} /> : null}

      <Card>
        <View style={[styles.row, { marginBottom: space.sm }]}>
          <Receipt size={18} color={c.primary} />
          <Text variant="heading">Payment</Text>
        </View>
        <View style={{ gap: space.sm }}>
          <KeyValue label={`${p.days} ${p.days === 1 ? 'day' : 'days'}`} value={formatMoney(p.base)} />
          {p.cleaningFee?.amount > 0 ? <KeyValue label="Cleaning" value={formatMoney(p.cleaningFee)} /> : null}
          {p.delivery?.amount > 0 ? <KeyValue label="Delivery" value={formatMoney(p.delivery)} /> : null}
          {p.addOnsTotal?.amount > 0 ? <KeyValue label="Extras" value={formatMoney(p.addOnsTotal)} /> : null}
          {p.protection?.amount > 0 ? <KeyValue label="Protection" value={formatMoney(p.protection)} /> : null}
          {p.serviceFee?.amount > 0 ? <KeyValue label="Service fee" value={formatMoney(p.serviceFee)} /> : null}
          {p.discount?.amount > 0 ? <KeyValue label="Discount" value={`−${formatMoney(p.discount)}`} tone="success" /> : null}
          <KeyValue label="Total" value={formatMoney(p.total)} strong />
          <Button title="View full receipt" size="sm" variant="outline" onPress={() => router.push(`/bookings/${id}/receipt`)} />
        </View>
      </Card>

      <Card>
        <View style={{ gap: space.sm }}>
          {b.tripId && ['in_progress', 'paid', 'confirmed'].includes(b.status) ? (
            <Button title="Go to trip" icon={<ShieldCheck size={18} color={c.primaryForeground} />} onPress={() => router.push(`/trips/${b.tripId}`)} />
          ) : null}
          <Button title="Get help" variant="outline" onPress={() => router.push({ pathname: '/support', params: { bookingId: id } })} />
          {canReportNoShow ? <Button title="Host didn’t show up" variant="outline" loading={noShow.isPending} onPress={() => void onNoShow()} /> : null}
          {canCancel ? <Button title="Cancel trip" variant="outline" icon={<XCircle size={18} color={c.foreground} />} loading={cancel.isPending} onPress={() => void onCancel()} /> : null}
          {canCancel && cancelPreview.data ? (
            <Text variant="caption" tone="muted">
              {cancelPreview.data.nonRefundable.amount > 0 ? `If you cancel now, we will charge you ${formatMoney(cancelPreview.data.nonRefundable)} for this cancellation.` : 'If you cancel now, you get a full refund.'} Please refer{' '}
              <Text variant="caption" tone="primary" onPress={() => void openInAppBrowser(cancellationUrl)}>our cancellation policy</Text> for additional information.
            </Text>
          ) : null}
          {b.cancellation && (b.cancellation.charged || b.cancellation.refund.amount > 0) ? (
            <Text variant="caption" tone="muted">
              We have charged you{' '}
              {formatMoney(b.cancellation.charged ?? { amount: Math.max(0, p.total.amount - b.cancellation.refund.amount), currency: p.total.currency })} for this cancellation. Please refer{' '}
              <Text variant="caption" tone="primary" onPress={() => void openInAppBrowser(cancellationUrl)}>our cancellation policy</Text> for additional information.
            </Text>
          ) : null}
        </View>
      </Card>
    </Screen>
  );
}

export default function BookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireAuth>
      <BookingDetail id={id} />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  cover: { width: '100%', aspectRatio: 16 / 9 },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  dates: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.lg, marginTop: space.sm },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
});
