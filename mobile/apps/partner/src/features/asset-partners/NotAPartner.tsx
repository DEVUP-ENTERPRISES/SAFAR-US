import { Car } from 'lucide-react-native';
import { Card, EmptyState, useTheme } from '@catodrive/ui';
import { openInAppBrowser, webUrl } from '@catodrive/core';

/** Every portal screen's state when the account isn't enrolled in the programme yet. */
export function NotAPartner() {
  const { c } = useTheme();
  return (
    <Card>
      <EmptyState
        icon={<Car size={28} color={c.primary} />}
        title="You’re not an Asset Partner yet"
        body="This part of the portal opens once your application is approved and you’re enrolled in the programme."
        actionLabel="Apply to become a partner"
        onAction={() => void openInAppBrowser(webUrl('/asset-partners/apply'))}
      />
    </Card>
  );
}
