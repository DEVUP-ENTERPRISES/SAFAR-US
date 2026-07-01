'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bookingApi } from './api';
import type { QuoteInput } from './types';

export function useMyBookings(role: 'guest' | 'host' = 'guest') {
  return useQuery({ queryKey: ['bookings', role], queryFn: () => bookingApi.list(role) });
}

export function useBooking(id: string) {
  return useQuery({ queryKey: ['booking', id], queryFn: () => bookingApi.getById(id), enabled: !!id });
}

export function useQuote() {
  return useMutation({ mutationFn: (input: QuoteInput) => bookingApi.quote(input) });
}

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    // A stable idempotency key per attempt makes retries safe (backend dedupes).
    mutationFn: (input: QuoteInput) => bookingApi.create(input, crypto.randomUUID()),
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
