import { useCallback } from 'react';
import { useColorScheme } from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import { api } from '@catodrive/core/web/lib/api/client';
import { usePlatformConfig } from '@catodrive/core/web/features/platform/config';

export type SheetResult = { ok: true } | { ok: false; cancelled: boolean; message?: string };

const MERCHANT = 'CatoDrive';

/**
 * The website's Stripe Elements flows on the native payment sheet: pay a
 * booking's PaymentIntent, finish a bank check (3-D Secure), save a card.
 */
export function usePayments() {
  const stripe = useStripe();
  const dark = useColorScheme() === 'dark';
  const available = !!usePlatformConfig().data?.stripe?.publishableKey;
  const base = {
    merchantDisplayName: MERCHANT,
    returnURL: 'catodrive://stripe-redirect',
    style: dark ? ('alwaysDark' as const) : ('alwaysLight' as const),
    googlePay: { merchantCountryCode: 'US', testEnv: __DEV__ },
    applePay: { merchantCountryCode: 'US' },
  };

  const present = useCallback(async (): Promise<SheetResult> => {
    const { error } = await stripe.presentPaymentSheet();
    if (!error) return { ok: true };
    return { ok: false, cancelled: error.code === 'Canceled', message: error.localizedMessage ?? error.message };
  }, [stripe]);

  /** Pays a PaymentIntent the server created for a booking. */
  const payIntent = useCallback(
    async (clientSecret: string): Promise<SheetResult> => {
      if (!available) return { ok: false, cancelled: false, message: 'Payments are not available right now. Please try again shortly.' };
      const init = await stripe.initPaymentSheet({ ...base, paymentIntentClientSecret: clientSecret });
      if (init.error) return { ok: false, cancelled: false, message: init.error.localizedMessage ?? init.error.message };
      return present();
    },
    [stripe, available, present], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** Completes a bank's extra check on a card payment. */
  const confirmNextAction = useCallback(
    async (clientSecret: string): Promise<boolean> => {
      if (!available) return false;
      const { error } = await stripe.handleNextAction(clientSecret, 'catodrive://stripe-redirect');
      return !error;
    },
    [stripe, available],
  );

  /** Saves a card to the account: Stripe collects it, the server reads the details from Stripe and stores it. */
  const saveCard = useCallback(async (): Promise<SheetResult> => {
    if (!available) return { ok: false, cancelled: false, message: 'Saving a card isn’t available right now. Please try again in a little while.' };
    const r = await api.post<{ provider: 'mock' | 'stripe'; clientSecret: string }>('/payments/methods/setup-intent', {});
    if (r.provider !== 'stripe') return { ok: false, cancelled: false, message: 'Saving a card isn’t available right now.' };
    const init = await stripe.initPaymentSheet({ ...base, setupIntentClientSecret: r.clientSecret });
    if (init.error) return { ok: false, cancelled: false, message: init.error.localizedMessage ?? init.error.message };
    const shown = await present();
    if (!shown.ok) return shown;
    const { setupIntent, error } = await stripe.retrieveSetupIntent(r.clientSecret);
    const pmId = setupIntent?.paymentMethod?.id ?? (setupIntent as unknown as { paymentMethodId?: string } | undefined)?.paymentMethodId;
    if (error || !pmId) return { ok: false, cancelled: false, message: 'The card was not returned by Stripe. Please try again.' };
    // Brand, last 4 and expiry are read from Stripe by the server; these are placeholders the API requires.
    await api.post('/payments/methods', { brand: 'card', last4: '0000', expMonth: 12, expYear: new Date().getFullYear() + 3, stripePaymentMethodId: pmId });
    return { ok: true };
  }, [stripe, available, present]); // eslint-disable-line react-hooks/exhaustive-deps

  return { available, payIntent, confirmNextAction, saveCard };
}
