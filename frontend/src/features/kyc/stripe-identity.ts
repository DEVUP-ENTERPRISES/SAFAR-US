export const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

/** Minimal shape of the bits of Stripe.js we touch — no SDK dependency. */
interface StripeLike {
  verifyIdentity(clientSecret: string): Promise<{ error?: { code?: string; message?: string } }>;
}
type StripeCtor = (key: string) => StripeLike;

/**
 * Loads Stripe.js once per page from Stripe's CDN — same runtime-injection
 * pattern as the map loaders. Stripe.js MUST be served from js.stripe.com (they
 * refuse to run when self-hosted), so a script tag is the only option; we just
 * make sure concurrent callers share one tag.
 */
let promise: Promise<StripeCtor> | null = null;

function loadStripeJs(): Promise<StripeCtor> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Stripe.js is browser-only'));
  const existing = (window as unknown as { Stripe?: StripeCtor }).Stripe;
  if (existing) return Promise.resolve(existing);
  if (promise) return promise;

  promise = new Promise<StripeCtor>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.async = true;
    script.onload = () => {
      const S = (window as unknown as { Stripe?: StripeCtor }).Stripe;
      if (S) resolve(S);
      else reject(new Error('Stripe.js loaded but window.Stripe is missing'));
    };
    script.onerror = () => {
      promise = null; // let a later attempt retry
      reject(new Error('Stripe.js failed to load'));
    };
    document.head.appendChild(script);
  });
  return promise;
}

export type VerifyOutcome = 'completed' | 'canceled';

/**
 * Opens Stripe Identity's hosted modal for document + selfie capture against a
 * verification session's client secret. Resolves once the modal closes —
 * `completed` when the user finished submitting (the decision still arrives by
 * webhook), `canceled` if they dismissed it. Throws only on a genuine failure.
 */
export async function openIdentityModal(clientSecret: string): Promise<VerifyOutcome> {
  if (!STRIPE_PUBLISHABLE_KEY) throw new Error('Stripe publishable key is not configured');
  const Stripe = await loadStripeJs();
  const stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
  const { error } = await stripe.verifyIdentity(clientSecret);
  if (error) {
    // The user closing the modal surfaces as a benign cancellation, not an error.
    if (error.code === 'session_cancelled' || error.code === 'consent_declined') return 'canceled';
    throw new Error(error.message ?? 'Identity verification could not be completed');
  }
  return 'completed';
}
