import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { STRIPE_PUBLISHABLE_KEY } from '@/features/kyc/stripe-identity';

/**
 * Finishing a 3-D Secure challenge.
 *
 * A card charged off-session can come back needing the cardholder — the bank
 * wants a challenge before it approves. That is not a failure and must not be
 * treated as one: it is routine on European cards and increasingly common on
 * US ones, so declining at that point would refuse perfectly good payments.
 *
 * Stripe renders the challenge itself, in its own modal, so there is nothing to
 * build beyond handing it the secret and reading the outcome.
 */

let stripePromise: Promise<Stripe | null> | null = null;
const getStripe = () => {
  if (!stripePromise && STRIPE_PUBLISHABLE_KEY) stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
  return stripePromise;
};

/** Resolves true when the payment cleared, false when it did not. */
export async function confirmCardPayment(clientSecret: string): Promise<boolean> {
  const stripe = await getStripe();
  // No key configured means no challenge can be shown. Reporting failure is
  // the honest answer — the payment genuinely has not cleared.
  if (!stripe) return false;

  const { error, paymentIntent } = await stripe.handleNextAction({ clientSecret });
  if (error) return false;
  return paymentIntent?.status === 'succeeded' || paymentIntent?.status === 'requires_capture';
}
