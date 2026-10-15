'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useHostMe, isNotAHost } from '~/features/host/hooks';
import { useIsAssetPartner } from '@/features/asset-partners/hooks';
import { HostSidebar } from '~/features/host/components/host-sidebar';
import { captainApi } from '~/features/host/team-api';
import { goToSite } from '@/lib/sites';

function HostShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hostQuery = useHostMe();
  const isAssetPartner = useIsAssetPartner();

  const notAHost = isNotAHost(hostQuery.error);
  // A Captain has no fleet of their own, but does have the run of a trip's
  // handover screens on the cars assigned to them - that page is theirs too,
  // not just their own /captain queue.
  const isTripRoute = pathname?.startsWith('/ops/trips') ?? false;

  // Only asked once we know they have no fleet of their own - a real host is
  // never a Captain, so this would be a wasted round trip for everyone else.
  const captainQuery = useQuery({
    queryKey: ['captain-queue'],
    queryFn: () => captainApi.queue(),
    enabled: notAHost,
    retry: false,
  });

  useEffect(() => {
    if (notAHost && captainQuery.data && !isTripRoute) router.replace('/captain');
  }, [notAHost, captainQuery.data, isTripRoute, router]);

  /*
   * An Asset Partner always has a Host record underneath - it is the
   * marketplace-seller plumbing a Vehicle hangs off (see AssetPartnerModel's
   * doc comment) - so hostQuery succeeds for them exactly like it does for a
   * genuine self-serve host, and without this check they land in the full
   * self-serve shell below: Listings, Fleet, Operations, Captains.
   *
   * That is not just the wrong dashboard, it is a real data-integrity hole:
   * "Add a car" here creates a Vehicle with no assetPartnerId, which bills as
   * an ordinary host booking instead of running through the partner's actual
   * management fee, insurance and detailing terms. Redirect before any of
   * that renders, rather than only hiding the nav links to this route - a
   * partner who already knows the URL (or bookmarked it) must still be routed
   * away.
   */
  useEffect(() => {
    // Their dashboard is on the partner site; the session is carried across.
    if (isAssetPartner) void goToSite('partner', '/asset-partners/dashboard');
  }, [isAssetPartner]);

  if (isAssetPartner || isAssetPartner === undefined) {
    return <Skeleton className="h-64 w-full" />;
  }

  // Still deciding. `isPending` covers the first load; `isFetching` covers a
  // revalidation after a cached error - without it, React Query reports the old
  // error instantly and an existing host sees the signup screen flash.
  if (hostQuery.isPending || (hostQuery.isError && hostQuery.isFetching)) {
    return <Skeleton className="h-64 w-full" />;
  }

  // A real failure (network / 5xx / expired session) is NOT "you're not a host".
  // Say so and offer a retry instead of rendering an empty dashboard.
  if (hostQuery.isError && !notAHost) {
    return (
      <ErrorState
        message="Couldn't load your host profile. Check your connection and try again."
        retry={() => hostQuery.refetch()}
      />
    );
  }

  // A Captain has no Host record of their own, so they land here looking like
  // a brand new signup. They are not - a trip route is theirs to view bare
  // (no host sidebar, since most of it doesn't apply to them); anywhere else
  // they're mid-redirect to their own queue.
  if (notAHost && captainQuery.data && isTripRoute) return <>{children}</>;
  if (notAHost && (captainQuery.isPending || captainQuery.data)) {
    return <Skeleton className="h-64 w-full" />;
  }

  // Not an operations account: no sign-up here, only a way out.
  if (notAHost) {
    return <ErrorState message="This account can't use the CatoDrive operations panel." />;
  }

  return (
    /*
     * No pb-24 here. It used to reserve clearance for PanelSidebar's own
     * mobile bar, back when HostSidebar rendered one - now that it's
     * suppressed (showMobileNav={false} on HostSidebar, since
     * HostMobileTabBar already covers this route), the only bottom bar left
     * is HostMobileTabBar, which reserves its own clearance via its own
     * spacer div (see host-mobile-tab-bar.tsx). Keeping pb-24 on top of that
     * would just be redundant padding stacked under redundant padding.
     */
    <div className="flex gap-8">
      <HostSidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export default function HostLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The House Fleet bridge renders bare
  // - they're the pages that STORE the session, so guarding them would bounce
  // them before they can run.
  if (pathname === '/ops/bridge') {
    return <>{children}</>;
  }
  return (
    <AuthGuard loginPath="/sign-in">
      <HostShell>{children}</HostShell>
    </AuthGuard>
  );
}
