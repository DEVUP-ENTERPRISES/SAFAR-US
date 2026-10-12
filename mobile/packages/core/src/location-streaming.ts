import { useEffect } from 'react';
import * as Location from 'expo-location';
import { connectSocket } from './web/lib/realtime/socket';

/**
 * Shares this phone's position for a booking while the server has tracking
 * open for this person (the handover and return windows, or an exception).
 * Foreground only, at most every 15 seconds, same as the website.
 */
export function useLocationStreaming(bookingId: string, active: boolean) {
  useEffect(() => {
    if (!bookingId || !active) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    let last = 0;
    void (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted || cancelled) return;
      const socket = connectSocket();
      socket.emit('booking:join', bookingId, () => undefined);
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 15_000, distanceInterval: 10 }, (pos) => {
        const now = Date.now();
        if (now - last < 15_000) return;
        last = now;
        socket.emit('trip:location', { bookingId, lng: pos.coords.longitude, lat: pos.coords.latitude });
      });
      if (cancelled) sub.remove();
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [bookingId, active]);
}
