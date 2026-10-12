import { Text } from '@catodrive/ui';
import { usePlatformConfig } from '../web/features/platform/config';
import { openInAppBrowser, webUrl } from '../links';

/** "By continuing you agree to…" with the Terms and Privacy Policy that admin publishes. */
export function LegalConsent({ action = 'continuing' }: { action?: string }) {
  const cfg = usePlatformConfig().data;
  const terms = cfg?.legal?.termsUrl || webUrl('/terms');
  const privacy = cfg?.legal?.privacyUrl || webUrl('/privacy');
  return (
    <Text variant="caption" tone="muted" center>
      By {action} you agree to CatoDrive&apos;s{' '}
      <Text variant="caption" tone="primary" accessibilityRole="link" onPress={() => void openInAppBrowser(terms)}>Terms of Service</Text>
      {' '}and{' '}
      <Text variant="caption" tone="primary" accessibilityRole="link" onPress={() => void openInAppBrowser(privacy)}>Privacy Policy</Text>.
    </Text>
  );
}
