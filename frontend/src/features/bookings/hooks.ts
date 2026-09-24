'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bookingApi } from './api';
import { useAuthStore } from '@/features/auth/store';
import type { QuoteInput } from './types';

export function useMyBookings(role: 'guest' | 'host' = 'guest') {
  // Gated on being signed in. Nothing needed this while the hook was only
  // mounted on pages behind an auth guard, but the phone tab bar shows a trip
  // count on every screen — without this, every signed-out visitor fires a
  // request that can only ever 401.
  const status = useAuthStore((s) => s.status);
  return useQuery({
    queryKey: ['bookings', role],
    queryFn: () => bookingApi.list(role),
    enabled: status === 'authenticated',
  });
}

export function useBooking(id: string) {
  return useQuery({ queryKey: ['booking', id], queryFn: () => bookingApi.getById(id), enabled: !!id });
}

export function useQuote() {
  return useMutation({ mutationFn: (input: QuoteInput) => bookingApi.quote(input) });
}

/** Never blocks or fails the booking on a slow/denied/unsupported browser. */
function bestEffortCoords(): Promise<{ lat: number; lng: number } | undefined> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(undefined);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(undefined),
      { timeout: 1500, maximumAge: 300_000 },
    );
  });
}

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    // A stable idempotency key per attempt makes retries safe (backend dedupes).
    mutationFn: async (input: QuoteInput) => {
      const coords = await bestEffortCoords();
      return bookingApi.create(input, crypto.randomUUID(), coords);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings'] }),
  });
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => bookingApi.cancel(id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings'] }),
  });
}
