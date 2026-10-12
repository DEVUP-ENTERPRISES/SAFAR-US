import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@catodrive/ui';
import { bookingApi } from '@catodrive/core/web/features/bookings/api';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { usePayments } from './usePayments';

/** Finishes a held booking's payment: pay on the sheet, pass the bank check, or save a card first. */
export function useCompletePayment() {
  const qc = useQueryClient();
  const toast = useToast();
  const payments = usePayments();
  return useMutation({
    meta: { silentError: true },
    mutationFn: async (id: string) => {
      const s = await bookingApi.paymentSession(id);
      if (s.status === 'requires_payment_method') {
        if (s.clientSecret) {
          const r = await payments.payIntent(s.clientSecret);
          return { id, outcome: r.ok ? ('paid' as const) : r.cancelled ? ('cancelled' as const) : ('failed' as const) };
        }
        const saved = await payments.saveCard();
        if (!saved.ok) return { id, outcome: saved.cancelled ? ('cancelled' as const) : ('failed' as const) };
        return { id, outcome: 'card_saved' as const };
      }
      if (s.status === 'requires_action') {
        const ok = s.clientSecret ? await payments.confirmNextAction(s.clientSecret) : false;
        return { id, outcome: ok ? ('paid' as const) : ('failed' as const) };
      }
      return { id, outcome: 'paid' as const };
    },
    onSuccess: ({ id, outcome }) => {
      void qc.invalidateQueries({ queryKey: ['booking', id] });
      void qc.invalidateQueries({ queryKey: ['bookings'] });
      if (outcome === 'paid') toast({ tone: 'success', title: 'Payment complete' });
      else if (outcome === 'card_saved') toast({ tone: 'info', title: 'Card saved', body: 'Tap Complete payment again to pay with it.' });
      else if (outcome === 'failed') toast({ tone: 'error', title: 'The payment didn’t go through', body: 'Please try again.' });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not complete payment' }),
  });
}
