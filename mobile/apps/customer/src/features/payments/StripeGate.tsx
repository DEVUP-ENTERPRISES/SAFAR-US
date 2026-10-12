import type { ReactNode } from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';
import { usePlatformConfig } from '@catodrive/core/web/features/platform/config';

/** Stripe with the publishable key the API serves; without one the app still runs and card actions say so. */
export function StripeGate({ children }: { children: ReactNode }) {
  const key = usePlatformConfig().data?.stripe?.publishableKey;
  if (!key) return <>{children}</>;
  return (
    <StripeProvider publishableKey={key} merchantIdentifier="merchant.com.catodrive.app" urlScheme="catodrive">
      <>{children}</>
    </StripeProvider>
  );
}
