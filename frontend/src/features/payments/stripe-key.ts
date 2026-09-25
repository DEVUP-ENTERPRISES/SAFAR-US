import { useQuery } from '@tanstack/react-query';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { platformApi } from '@/features/platform/config';

const BUILD_TIME_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

let cached: Promise<string> | null = null;

/** Runtime key from the backend (source of truth), else the build-time one, else ''; never throws. */
export function getStripePublishableKey(): Promise<string> {
  if (cached) return cached;
  const attempt = platformApi
    .config()
    .then((cfg) => cfg.stripe?.publishableKey || BUILD_TIME_KEY)
    .catch(() => {
      // A failed fetch must not pin an empty answer; the next call retries.
      cached = null;
      return BUILD_TIME_KEY;
    });
  cached = attempt.then((key) => {
    if (!key) cached = null;
    return key;
  });
  return cached;
}

const stripeByKey = new Map<string, Promise<Stripe | null>>();

/** One loadStripe promise per key, shared by card entry and 3-D Secure. */
export function loadStripeForKey(key: string): Promise<Stripe | null> {
  let p = stripeByKey.get(key);
  if (!p) {
    p = loadStripe(key);
    stripeByKey.set(key, p);
  }
  return p;
}

/** For components: `ready` flips true once the key lookup has settled. */
export function useStripePublishableKey(): { key: string; ready: boolean } {
  const q = useQuery({
    queryKey: ['stripe-publishable-key'],
    queryFn: getStripePublishableKey,
    staleTime: 60 * 60 * 1000,
  });
  return { key: q.data ?? '', ready: !q.isPending };
}
