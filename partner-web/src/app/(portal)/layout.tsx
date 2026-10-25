'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Skeleton } from '@/components/ui/skeleton';
import { assetPartnerApi } from '@/features/asset-partners/api';
import { PartnerSidebar } from '~/components/portal/partner-sidebar';
import { AmendmentBanner } from '~/components/portal/amendment-banner';

/**
 * The Asset Partner portal shell.
 *
 * A route GROUP - `(portal)` adds no URL segment, so these pages stay at
 * /dashboard, /vehicles and so on. That matters
 * because /asset-partners and /asset-partners/apply are public marketing and
 * intake: a layout at the /asset-partners level would have put the whole
 * pitch behind a login wall.
 *
 * No onboarding fork here, unlike the host and corporate shells. A partner
 * cannot self-enrol - they apply, and ops approves - so each page handles its
 * own "you're not in the programme yet" state against real data rather than
 * this layout guessing.
 */
// The dashboard stays closed until getting started is finished; the server enforces the same rule.
function ReadyGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const q = useQuery({ queryKey: ['partner-onboarding'], queryFn: () => assetPartnerApi.onboarding() });
  const ready = q.data?.stage === 'ready';
  useEffect(() => {
    if (q.data && !ready) router.replace('/onboarding');
  }, [q.data, ready, router]);
  // If the check itself fails, the pages still load and show their own errors.
  if (!ready && !q.isError) return <Skeleton className="h-96 w-full rounded-lg" />;
  return <>{children}</>;
}

export default function AssetPartnerPortalLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard loginPath="/sign-in">
      <ReadyGate>
      {/*
        pb-24 (a flat 96px) used to reserve clearance for PartnerSidebar's
        mobile bar - its real height is 4rem (64px) plus the safe-area inset,
        the same formula the guest tab bar reserves for itself (see
        mobile-tab-bar.tsx). 96px was neither: bigger than the bar on an
        ordinary phone (visible dead space below the content) and not
        necessarily enough on a device with a tall safe-area inset either,
        since a flat class can't respond to env().
      */}
      <div className="flex gap-8 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <PartnerSidebar />
        <div className="min-w-0 flex-1"><AmendmentBanner />{children}</div>
      </div>
      </ReadyGate>
    </AuthGuard>
  );
}
