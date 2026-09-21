'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Navbar } from './navbar';
import { Footer } from './footer';
import { MobileTabBar } from './mobile-tab-bar';
import { HostMobileTabBar } from './host-mobile-tab-bar';
import { CompareBar } from '@/features/vehicles/components/compare-bar';
import { useIsHost } from '@/features/host/hooks';
import { useIsAssetPartner } from '@/features/asset-partners/hooks';
import { RegisterServiceWorker } from '@/features/pwa/register-sw';
import { InstallPrompt } from '@/features/pwa/install-prompt';
import { IntroSplash } from '@/features/pwa/intro-splash';
import { RouteProgress } from './route-progress';
import { PageTransition } from './page-transition';

/**
 * Decides which chrome a route gets.
 *
 * The auth screens render bare — no marketplace chrome around a sign-in form.
 * The admin console is no longer one of these cases: it moved to its own
 * application (admin-web, port 3005) and this app serves none of it.
 */
export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const isHost = useIsHost();
  const isAssetPartner = useIsAssetPartner();
  const isAuth = pathname === '/login' || pathname === '/register' || pathname === '/forgot-password';

  if (isAuth) return <>{children}</>;

  // A host inside their dashboard gets the host tab bar; everyone else (and a
  // non-host viewing the "become a host" landing) gets the guest bar.
  const hostMode = isHost && (pathname === '/host' || pathname.startsWith('/host/'));

  /*
   * The Asset Partner portal ((portal) route group — no URL segment, so these
   * pages live directly at /asset-partners/dashboard, /vehicles, /statements
   * etc.) has its own mobile bottom nav: PartnerSidebar renders itself as a
   * fixed bottom-0 bar on mobile, same as HostSidebar does for /host.
   *
   * Unlike hostMode above, this was never wired into the chrome switch here —
   * so the guest MobileTabBar rendered underneath it on every portal page,
   * and the two fixed-bottom bars stacked: the top sliver of the partner
   * nav's icons showing above the guest nav's Home/Search/Saved/Trips row.
   *
   * Excludes /asset-partners itself and /asset-partners/apply — those are the
   * public marketing page and the public intake form, not the authenticated
   * portal, and a visitor there still wants ordinary site navigation.
   */
  const assetPartnerPortalMode =
    isAssetPartner && pathname.startsWith('/asset-partners/') && pathname !== '/asset-partners/apply';

  return (
    <>
      <RouteProgress />
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-8 pt-24 sm:px-6">
        <PageTransition>{children}</PageTransition>
      </main>
      <Footer />
      <CompareBar />
      {hostMode ? <HostMobileTabBar /> : assetPartnerPortalMode ? null : <MobileTabBar />}
      <RegisterServiceWorker />
      <InstallPrompt />
      <IntroSplash />
    </>
  );
}
