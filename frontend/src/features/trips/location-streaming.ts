'use client';

import { useEffect } from 'react';
import { connectSocket } from '@/lib/realtime/socket';

export function useLocationStreaming(bookingId: string, active: boolean) {
  useEffect(() => {
    if (!bookingId || !active || typeof navigator === 'undefined' || !navigator.geolocation) return;
    const socket = connectSocket();
    socket.emit('booking:join', bookingId, () => undefined);
    let last = 0;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - last < 15_000) return;
        last = now;
        socket.emit('trip:location', { bookingId, lng: pos.coords.longitude, lat: pos.coords.latitude });
      },
      () => {
        /* permission denied / unavailable - the trip simply has no live location */
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [bookingId, active]);
}
