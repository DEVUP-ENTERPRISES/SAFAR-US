import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Chip, ErrorState, Screen, ScreenHeader, Skeleton, space } from '@catodrive/ui';
import { InspectionPhotos, RequireAuth } from '@catodrive/core';
import { hostTripsApi } from '@catodrive/core/web/features/host/trips.api';

/** The website's trip photos: pickup photos prove the handover condition, return photos are the damage evidence. */
function TripPhotos({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<'pre' | 'post'>('pre');
  const q = useQuery({ queryKey: ['host-trip', bookingId], queryFn: () => hostTripsApi.one(bookingId) });
  const t = q.data;
  const back = () => (router.canGoBack() ? router.back() : router.replace(`/host/trips/${bookingId}`));
  return (
    <Screen
      header={<ScreenHeader title="Trip photos" subtitle={t ? `${t.vehicle.make} ${t.vehicle.model} · ${t.photoCount} photo${t.photoCount === 1 ? '' : 's'}` : undefined} onBack={back} />}
    >
      {q.isPending ? <Skeleton height={240} /> : null}
      {q.isError ? <ErrorState message="Trip not found." onRetry={() => void q.refetch()} /> : null}
      {t ? (
        <>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Chip label="Pickup" selected={phase === 'pre'} onPress={() => setPhase('pre')} />
            <Chip label="Return" selected={phase === 'post'} onPress={() => setPhase('post')} />
          </View>
          <InspectionPhotos bookingId={bookingId} phase={phase} />
          <Button title="Done" variant="outline" onPress={back} />
        </>
      ) : null}
    </Screen>
  );
}

export default function TripPhotosScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  return (
    <RequireAuth>
      <TripPhotos bookingId={bookingId} />
    </RequireAuth>
  );
}
