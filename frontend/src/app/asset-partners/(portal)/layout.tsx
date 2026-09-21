'use client';

import type { ReactNode } from 'react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { PartnerSidebar } from '@/features/asset-partners/components/partner-sidebar';

/**
 * The Asset Partner portal shell.
 *
 * A route GROUP — `(portal)` adds no URL segment, so these pages stay at
 * /asset-partners/dashboard, /asset-partners/vehicles and so on. That matters
 * because /asset-partners and /asset-partners/apply are public marketing and
 * intake: a layout at the /asset-partners level would have put the whole
 * pitch behind a login wall.
 *
 * No onboarding fork here, unlike the host and corporate shells. A partner
 * cannot self-enrol — they apply, and ops approves — so each page handles its
 * own "you're not in the programme yet" state against real data rather than
 * this layout guessing.
 */
export default function AssetPartnerPortalLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      {/*
        pb-24 (a flat 96px) used to reserve clearance for PartnerSidebar's
        mobile bar — its real height is 4rem (64px) plus the safe-area inset,
        the same formula the guest tab bar reserves for itself (see
        mobile-tab-bar.tsx). 96px was neither: bigger than the bar on an
        ordinary phone (visible dead space below the content) and not
        necessarily enough on a device with a tall safe-area inset either,
        since a flat class can't respond to env().
      */}
      <div className="flex gap-8 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <PartnerSidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </AuthGuard>
  );
}
