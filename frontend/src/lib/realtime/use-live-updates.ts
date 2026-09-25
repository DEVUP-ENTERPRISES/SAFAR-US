'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store';
import { connectSocket } from './socket';

/** One app-wide subscription: booking and notification pushes refresh the cached queries they affect. */
export function useLiveUpdates() {
  const qc = useQueryClient();
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status !== 'authenticated') return;
    const socket = connectSocket();
    const onBooking = (p?: { bookingId?: string }) => {
      if (p?.bookingId) {
        qc.invalidateQueries({ queryKey: ['booking', p.bookingId] });
        qc.invalidateQueries({ queryKey: ['host-trip', p.bookingId] });
      }
      for (const key of ['bookings', 'host-bookings', 'host-trips', 'host-inbox']) qc.invalidateQueries({ queryKey: [key] });
    };
    const onNotification = () => qc.invalidateQueries({ queryKey: ['notifications'] });
    socket.on('booking:update', onBooking);
    socket.on('notification', onNotification);
    return () => {
      socket.off('booking:update', onBooking);
      socket.off('notification', onNotification);
    };
  }, [qc, status]);
}
