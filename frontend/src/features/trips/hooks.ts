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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (readings: { odometerEnd?: number; fuelEnd?: number } = {}) =>
      tripApi.complete(id, readings.odometerEnd, readings.fuelEnd),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trip', id] }),
  });
}
export function useSos(id: string) {
  return useMutation({ mutationFn: () => tripApi.sos(id) });
}

/**
 * Streams the guest's own device location to the trip while it's active, so the
 * host can watch the car move in real time. Emits over the socket — that path
 * both persists the fix and broadcasts it to everyone watching the trip room
 * (the REST endpoint only persists). Uses the browser's geolocation watch,
 * throttled to at most one update every 15s to spare battery and bandwidth, and
 * stops the moment the trip is no longer active or the screen unmounts.
 */
export function useLocationStreaming(id: string, active: boolean) {
  useEffect(() => {
    if (!id || !active || typeof navigator === 'undefined' || !navigator.geolocation) return;
    const socket = connectSocket();
    socket.emit('trip:join', id, () => undefined);
    let last = 0;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - last < 15_000) return;
        last = now;
        socket.emit('trip:location', { tripId: id, lng: pos.coords.longitude, lat: pos.coords.latitude });
      },
      () => {
        /* permission denied / unavailable — the trip simply has no live location */
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [id, active]);
}
