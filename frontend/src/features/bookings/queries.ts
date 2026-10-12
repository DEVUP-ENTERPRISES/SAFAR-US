import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bookingApi } from './api';
import { useAuthStore } from '@/features/auth/store';
import type { QuoteInput } from './types';

export function useMyBookings(role: 'guest' | 'host' = 'guest') {
  // Gated on being signed in: the tab bar shows a trip count on every screen, and a signed-out request can only 401.
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

/** A v4 id for the idempotency key; crypto.randomUUID where the platform has it. */
export function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Creates the booking with a fresh idempotency key per attempt (the backend
 * dedupes retries). `coords` is where the guest is, best effort, for the risk
 * check; each platform supplies its own way of asking.
 */
export function useCreateBooking(coords: () => Promise<{ lat: number; lng: number } | undefined> = async () => undefined) {
  const qc = useQueryClient();
  return useMutation({
    // The booking panel shows the error inline (with "use another card" for a decline); no second toast.
    meta: { silentError: true },
    mutationFn: async (input: QuoteInput) => bookingApi.create(input, newIdempotencyKey(), await coords()),
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
