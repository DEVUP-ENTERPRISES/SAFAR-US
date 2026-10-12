import { View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Shuffle } from 'lucide-react-native';
import { Button, Card, Text, useTheme, useToast, space } from '@catodrive/ui';
import { bookingApi } from '@catodrive/core/web/features/bookings/api';
import type { Booking } from '@catodrive/core/web/features/bookings/types';
import { ApiError } from '@catodrive/core/web/lib/api/types';

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

/** The car is running late from its last trip: switch to a similar car at the same price, or wait for it. */
export function SwapOfferCard({ booking }: { booking: Booking }) {
  const { c } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ['booking', booking._id] });
  const accept = useMutation({
    meta: { silentError: true },
    mutationFn: () => bookingApi.acceptSwapOffer(booking._id),
    onSuccess: () => { toast({ tone: 'success', title: 'Done. Your trip is now on the new car, same dates and price.' }); refresh(); },
    onError: (e) => { toast({ tone: 'error', title: errorText(e) }); refresh(); },
  });
  const decline = useMutation({
    meta: { silentError: true },
    mutationFn: () => bookingApi.declineSwapOffer(booking._id),
    onSuccess: () => { toast({ tone: 'info', title: 'You kept your booking. We will tell you when the car is back.' }); refresh(); },
    onError: (e) => { toast({ tone: 'error', title: errorText(e) }); refresh(); },
  });
  const offer = booking.swapOffer;
  if (offer?.status !== 'open') return null;
  return (
    <Card style={{ borderColor: c.warning }}>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Shuffle size={20} color={c.warning} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="heading">Your car may not be back in time</Text>
          <Text tone="muted">It is running late from its previous trip. You can switch to a {offer.toName} for the same dates at no extra cost, or keep your booking and wait for it.</Text>
        </View>
      </View>
      <View style={{ gap: space.sm, marginTop: space.md }}>
        <Button title={`Switch to the ${offer.toName}`} loading={accept.isPending} disabled={decline.isPending} onPress={() => accept.mutate()} />
        <Button title="Keep my booking" variant="outline" loading={decline.isPending} disabled={accept.isPending} onPress={() => decline.mutate()} />
      </View>
    </Card>
  );
}
