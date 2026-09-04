'use client';

import { useState } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { CreditCard, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { STRIPE_PUBLISHABLE_KEY } from '@/features/kyc/stripe-identity';
import { api } from '@/lib/api/client';

/**
 * Adding a real card.
 *
 * There was no card entry anywhere in this app. Account settings collected a
 * brand and a last4 as plain text fields — a note about a card, not a card —
 * so nothing was ever tokenised and no booking could actually be charged. The
 * backend was building PaymentIntents that nothing on the client confirmed.
 *
 * The card is collected by Stripe, in a Stripe-hosted iframe: the number never
 * touches our page, our servers, or our logs, which is what keeps PCI scope to
 * the small self-assessment rather than a full audit.
 *
 * Collected through a SetupIntent rather than a payment, so the card is saved
 * against the customer and can be charged later without the guest present —
 * which is what makes one-tap booking possible at all.
 */

let stripePromise: Promise<Stripe | null> | null = null;
const getStripe = () => {
  if (!stripePromise && STRIPE_PUBLISHABLE_KEY) stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
  return stripePromise;
};

export function AddCard({ onSaved }: { onSaved?: () => void }) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Without a key the whole surface hides rather than rendering a dead form.
  if (!STRIPE_PUBLISHABLE_KEY) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-start gap-3 py-5 text-sm text-muted-foreground">
          <CreditCard className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            Card payments are not configured yet. Set{' '}
            <code className="rounded bg-muted px-1">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> to enable them.
          </p>
        </CardContent>
      </Card>
    );
  }

  const begin = async () => {
    setStarting(true);
    setError(null);
    try {
      const r = await api.post<{ provider: 'mock' | 'stripe'; clientSecret: string }>(
        '/payments/methods/setup-intent',
        {},
      );
      if (r.provider !== 'stripe') {
        setError('The server is running without Stripe, so a real card cannot be saved.');
        return;
      }
      setClientSecret(r.clientSecret);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start card setup');
    } finally {
      setStarting(false);
    }
  };

  if (!clientSecret) {
    return (
      <div>
        <Button onClick={begin} loading={starting}>
          <CreditCard className="h-4 w-4" /> Add a card
        </Button>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <Elements
      stripe={getStripe()}
      options={{
        clientSecret,
        appearance: {
          theme: 'flat',
          variables: {
            // Matched to the app's own tokens so the iframe does not read as a
            // third-party panel dropped into the page.
            colorPrimary: '#0d8f88',
            borderRadius: '12px',
            fontFamily: 'inherit',
          },
        },
      }}
    >
      <CardForm onSaved={onSaved} onCancel={() => setClientSecret(null)} />
    </Elements>
  );
}

function CardForm({ onSaved, onCancel }: { onSaved?: () => void; onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    try {
      const { error: err, setupIntent } = await stripe.confirmSetup({
        elements,
        // The card is saved in place; there is nowhere to send them afterwards.
        redirect: 'if_required',
      });

      if (err) {
        setError(err.message ?? 'That card could not be saved');
        return;
      }

      const pmId =
        typeof setupIntent?.payment_method === 'string'
          ? setupIntent.payment_method
          : setupIntent?.payment_method?.id;
      if (!pmId) {
        setError('The card was not returned by Stripe. Please try again.');
        return;
      }

      // Read the card's own details back rather than asking the person to type
      // a brand and last4 they can already see on the card.
      const pm = typeof setupIntent!.payment_method === 'object' ? setupIntent!.payment_method : null;
      await api.post('/payments/methods', {
        brand: pm?.card?.brand ?? 'card',
        last4: pm?.card?.last4 ?? '0000',
        expMonth: pm?.card?.exp_month ?? 12,
        expYear: pm?.card?.exp_year ?? new Date().getFullYear() + 3,
        stripePaymentMethodId: pmId,
      });
      onSaved?.();
      onCancel();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that card');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <PaymentElement options={{ layout: 'tabs' }} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button loading={busy} disabled={!stripe} onClick={submit}>
            Save card
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" />
          Your card is held by Stripe. It never reaches our servers.
        </p>
      </CardContent>
    </Card>
  );
}

/** Skeleton for the card list while it loads. */
export function CardSkeleton() {
  return <Skeleton className="h-20 w-full" />;
}
