import { useRouter } from 'expo-router';
import { BarChart3, Building2, Car, GitCompare, Info, LayoutDashboard, Store } from 'lucide-react-native';
import { MenuRow, MenuSection, useTheme } from '@catodrive/ui';
import { openInAppBrowser, openPartner, webUrl } from '@catodrive/core';
import { useIsHost } from '@catodrive/core/web/features/host/hooks';
import { useIsAssetPartner } from '@catodrive/core/web/features/asset-partners/hooks';
import { config } from '@catodrive/core/web/lib/config';

/** The website's navbar and footer links that are not app tabs: explore, hosting and business, with the same visibility rules. */
export function ExploreLinks() {
  const { c } = useTheme();
  const router = useRouter();
  const isHost = useIsHost();
  const isAssetPartner = useIsAssetPartner();
  const icon = (I: React.ComponentType<{ size?: number; color?: string }>) => <I size={20} color={c.mutedForeground} />;
  // Same rule as the navbar: host self-serve shows outside the Asset-Partners-only launch, and never to an Asset Partner.
  const showHost = (isHost || !config.assetPartnersOnly) && !isAssetPartner;

  return (
    <>
      <MenuSection title="Explore">
        <MenuRow icon={icon(Info)} label="How it works" onPress={() => void openInAppBrowser(webUrl('/about'))} />
        <MenuRow icon={icon(GitCompare)} label="Compare cars" onPress={() => router.push('/compare')} />
        <MenuRow icon={icon(BarChart3)} label="Investor Relations" onPress={() => void openInAppBrowser(webUrl('/investors'))} />
      </MenuSection>

      <MenuSection title="Hosting and business">
        {isAssetPartner ? (
          <MenuRow icon={icon(LayoutDashboard)} label="Partner dashboard" onPress={() => void openPartner('/asset-partners/dashboard')} />
        ) : (
          <MenuRow icon={icon(Store)} label="Asset Partners" onPress={() => void openInAppBrowser(webUrl('/asset-partners'))} />
        )}
        {showHost ? (
          <MenuRow icon={icon(Car)} label={isHost ? 'Host dashboard' : 'Become a host'} onPress={() => void openPartner('/host')} />
        ) : null}
        {!config.assetPartnersOnly && config.corporate ? (
          <MenuRow icon={icon(Building2)} label={`${config.appName} for Business`} onPress={() => void openInAppBrowser(webUrl('/corporate'))} />
        ) : null}
      </MenuSection>
    </>
  );
}
