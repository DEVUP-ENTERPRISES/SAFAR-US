'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bookingApi } from './api';
import { useCreateBooking as useCreateBookingWith } from './queries';
import { confirmCardPayment } from '@/features/payments/confirm-payment';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/types';

export { useMyBookings, useBooking, useQuote, useCancelBooking } from './queries';

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

/** The shared create hook, with the browser's location for the risk check. */
export function useCreateBooking() {
  return useCreateBookingWith(bestEffortCoords);
}

export function useCompletePayment() {
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const s = await bookingApi.paymentSession(id);
      if (s.status === 'requires_payment_method') return { id, outcome: s.clientSecret ? ('checkout' as const) : ('needs_card' as const), clientSecret: s.clientSecret };
      if (s.status === 'requires_action') {
        const ok = s.clientSecret ? await confirmCardPayment(s.clientSecret) : false;
        return { id, outcome: ok ? ('paid' as const) : ('failed' as const) };
      }
      return { id, outcome: 'paid' as const };
    },
    onSuccess: ({ id, outcome }) => {
      qc.invalidateQueries({ queryKey: ['booking', id] });
      qc.invalidateQueries({ queryKey: ['bookings'] });
      if (outcome === 'paid') toast({ tone: 'success', title: 'Payment complete' });
      else if (outcome === 'checkout') return;
      else if (outcome === 'failed') toast({ tone: 'error', title: 'The payment didn’t go through', description: 'Please try again.' });
      else {
        toast({ tone: 'info', title: 'Add a card to pay', description: 'Save a card in your account, then come back and tap Complete payment again.' });
        router.push('/account');
      }
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not complete payment' }),
  });
}
