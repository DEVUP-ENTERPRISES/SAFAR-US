'use client';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { connectSocket } from '@/lib/realtime/socket';
import { tripApi } from './api';

export function useTrip(id: string) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['trip', id], queryFn: () => tripApi.get(id), enabled: !!id });

  // Live trip status + location via socket; refetch on status change.
  useEffect(() => {
    if (!id) return;
    const socket = connectSocket();
    socket.emit('trip:join', id, () => undefined);
    const onStatus = () => qc.invalidateQueries({ queryKey: ['trip', id] });
    const onLocation = (loc: { tripId: string; lng: number; lat: number; at: string }) => {
      if (loc.tripId !== id) return;
      qc.setQueryData(['trip', id], (prev: unknown) =>
        prev
          ? { ...(prev as object), liveLocation: { coordinates: [loc.lng, loc.lat], updatedAt: loc.at } }
          : prev,
      );
    };
    socket.on('trip:status', onStatus);
    socket.on('trip:location', onLocation);
    return () => {
      socket.off('trip:status', onStatus);
      socket.off('trip:location', onLocation);
    };
  }, [id, qc]);

  return query;
}

function useTripAction<T>(id: string, fn: () => Promise<T>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trip', id] }),
  });
}

export function useCheckIn(id: string) {
  return useTripAction(id, () => tripApi.checkIn(id, 'contactless'));
}
export function useCompleteTrip(id: string) {
  return useTripAction(id, () => tripApi.complete(id));
}
export function useSos(id: string) {
  return useMutation({ mutationFn: () => tripApi.sos(id) });
}
