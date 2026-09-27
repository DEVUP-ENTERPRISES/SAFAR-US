'use client';

import { useState } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { loadStripeForKey, useStripePublishableKey } from '@/features/payments/stripe-key';

/**
 * On-page checkout with every payment method switched on in the Stripe dashboard:
 * cards, Apple Pay, Google Pay, Link, Klarna, Affirm, Afterpay, Cash App, Amazon Pay.
 * Stripe decides which to show for the amount, country and device. Methods that
 * leave the page (a bank or pay-later site) come back to `returnPath`.
 */
function Form({ returnPath, onPaid }: { returnPath: string; onPaid: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    const { error: err, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}${returnPath}` },
      redirect: 'if_required',
    });
    setBusy(false);
    if (err) return setError(err.message ?? 'The payment did not go through.');
    if (paymentIntent && ['succeeded', 'processing', 'requires_capture'].includes(paymentIntent.status)) onPaid();
  };

  return (
    <div className="space-y-3">
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" size="lg" loading={busy} disabled={!stripe} onClick={pay}>
        <Lock className="h-4 w-4" /> Pay now
      </Button>
    </div>
  );
}

export function PayNow({ clientSecret, returnPath, onPaid }: { clientSecret: string; returnPath: string; onPaid: () => void }) {
  const { key, ready } = useStripePublishableKey();
  if (!ready) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  if (!key) return <p className="text-sm text-muted-foreground">Online payment isn’t available right now. Please pay with a saved card.</p>;
  return (
    <Elements stripe={loadStripeForKey(key)} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
      <Form returnPath={returnPath} onPaid={onPaid} />
    </Elements>
  );
}
