import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { CarFront } from 'lucide-react-native';
import { Button, Card, EmptyState, ErrorState, ScreenHeader, SkeletonList, Text, useTheme, space } from '@catodrive/ui';
import { useMyBookings } from '@catodrive/core/web/features/bookings/queries';
import { CANCELLABLE, HOST_STARTS, NEXT_STEP } from '@catodrive/core/web/features/bookings/status';
import type { Booking } from '@catodrive/core/web/features/bookings/types';
import { tripApi } from '@catodrive/core/web/features/trips/api';
import { usePlatformConfig } from '@catodrive/core/web/features/platform/config';
import { useAuthStore } from '@catodrive/core/web/features/auth/store';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { formatDateTime, formatMoney } from '@catodrive/core/web/lib/utils/format';
import { StatusBadge } from '@/features/bookings/StatusBadge';
import { ExtendTrip } from '@/features/bookings/ExtendTrip';
import { ShortenTrip } from '@/features/bookings/ShortenTrip';
import { useCancelTrip } from '@/features/bookings/useCancelTrip';
import { useCompletePayment } from '@/features/payments/useCompletePayment';
import { SignedOutPrompt } from '@/features/account/SignedOutPrompt';

/** The website's /bookings: every trip with its next step and the actions it allows. */
function TripsList() {
  const { c } = useTheme();
  const router = useRouter();
  const { data, isPending, isError, refetch, isRefetching } = useMyBookings('guest');
  const hostOnlyStart = usePlatformConfig().data?.handover?.hostOnlyStart === true;
  const completePayment = useCompletePayment();
  const cancelTrip = useCancelTrip();
  const [open, setOpen] = useState<{ id: string; panel: 'extend' | 'shorten' } | null>(null);

  const startTrip = useMutation({
    meta: { silentError: true },
    mutationFn: (bookingId: string) => tripApi.start(bookingId),
    onSuccess: (trip) => router.push(`/trips/${trip._id}`),
    onError: (err, bookingId) => {
      if (err instanceof ApiError && err.code === 'PRE_PHOTOS_REQUIRED') router.push(`/bookings/${bookingId}`);
    },
  });

  const toggle = (id: string, panel: 'extend' | 'shorten') => setOpen(open?.id === id && open.panel === panel ? null : { id, panel });

  const renderItem = ({ item: b }: { item: Booking }) => {
    const startError = b.status === 'paid' && startTrip.variables === b._id && startTrip.error instanceof ApiError ? startTrip.error : null;
    return (
      <Card padded={false}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Trip ${b.code}`} onPress={() => router.push(`/bookings/${b._id}`)} style={styles.head}>
          <View style={styles.row}>
            <Text variant="heading">{b.code}</Text>
            <StatusBadge status={b.status} />
          </View>
          <Text variant="caption" tone="muted">Pick-up {formatDateTime(b.period.start)} → Return {formatDateTime(b.period.end)}</Text>
          {NEXT_STEP[b.status] ? <Text variant="label" tone="primary">{NEXT_STEP[b.status]}</Text> : null}
          {b.status === 'paid' && (hostOnlyStart || startError?.code === 'HOST_ONLY_START') ? <Text variant="caption" tone="muted">{HOST_STARTS}</Text> : null}
          {startError && startError.code !== 'HOST_ONLY_START' && startError.code !== 'PRE_PHOTOS_REQUIRED' ? <Text variant="caption" tone="destructive">{startError.message}</Text> : null}
        </Pressable>
        <View style={[styles.actions, { borderTopColor: c.border }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="View receipt" onPress={() => router.push(`/bookings/${b._id}/receipt`)}>
            <Text variant="heading">{formatMoney(b.priceBreakdown.total)}</Text>
          </Pressable>
          <View style={styles.buttons}>
            {b.status === 'pending_payment' ? (
              <Button title="Complete payment" size="sm" full={false} loading={completePayment.isPending && completePayment.variables === b._id} onPress={() => completePayment.mutate(b._id)} />
            ) : null}
            {b.status === 'paid' && !hostOnlyStart ? <Button title="Start trip" size="sm" full={false} loading={startTrip.isPending} onPress={() => startTrip.mutate(b._id)} /> : null}
            {b.status === 'in_progress' && b.tripId ? <Button title="Open trip" size="sm" full={false} onPress={() => router.push(`/trips/${b.tripId}`)} /> : null}
            {['paid', 'in_progress'].includes(b.status) ? <Button title="Extend" size="sm" variant="outline" full={false} onPress={() => toggle(b._id, 'extend')} /> : null}
            {b.status === 'paid' ? <Button title="Shorten" size="sm" variant="outline" full={false} onPress={() => toggle(b._id, 'shorten')} /> : null}
            {['completed', 'cancelled'].includes(b.status) ? <Button title="Book again" size="sm" variant="outline" full={false} onPress={() => router.push(`/vehicles/${b.vehicleId}`)} /> : null}
            {CANCELLABLE.includes(b.status) ? <Button title="Cancel" size="sm" variant="ghost" full={false} loading={cancelTrip.isPending(b._id)} onPress={() => void cancelTrip.start(b)} /> : null}
          </View>
        </View>
        {open?.id === b._id ? (
          <View style={[styles.panel, { borderTopColor: c.border }]}>
            {open.panel === 'extend' ? <ExtendTrip booking={b} onDone={() => setOpen(null)} /> : <ShortenTrip booking={b} onDone={() => setOpen(null)} />}
          </View>
        ) : null}
      </Card>
    );
  };

  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(b) => b._id}
      renderItem={renderItem}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
      onRefresh={() => void refetch()}
      refreshing={isRefetching}
      ListEmptyComponent={
        isPending ? (
          <SkeletonList rows={3} height={140} />
        ) : isError ? (
          <ErrorState message="Couldn't load your trips." onRetry={() => void refetch()} />
        ) : (
          <EmptyState icon={<CarFront size={28} color={c.primary} />} title="No trips yet" body="Book a vehicle to see it here." actionLabel="Find a car" onAction={() => router.navigate('/search')} />
        )
      }
    />
  );
}

export default function TripsTab() {
  const { c } = useTheme();
  const status = useAuthStore((s) => s.status);
  if (status === 'unauthenticated') {
    return <SignedOutPrompt title="Your trips" heading="Your trips live here" body="Sign in to see your upcoming and past trips." returnTo="/bookings" />;
  }
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title="Your trips" large />
      {status === 'authenticated' ? <TripsList /> : <View style={styles.list}><SkeletonList rows={3} height={140} /></View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  list: { padding: space.lg, paddingBottom: space.xxxl },
  head: { padding: space.lg, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  actions: { borderTopWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.md },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  panel: { borderTopWidth: StyleSheet.hairlineWidth, padding: space.lg },
});
