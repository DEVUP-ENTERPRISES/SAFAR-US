'use client';

import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, Car, FileText, Wrench, FolderLock, User, LayoutGrid, Handshake, Undo2,
} from 'lucide-react';
import { PanelSidebar, type PanelNavItem } from '@/components/layout/panel-sidebar';
import { assetPartnerApi } from '@/features/asset-partners/api';

const ICONS = {
  dashboard: LayoutDashboard,
  vehicles: Car,
  statements: FileText,
  maintenance: Wrench,
  documents: FolderLock,
  profile: User,
  returns: Undo2,
};

/*
 * mobileLabel on the three longer items below isn't a style choice - at 6
 * equal columns, a real phone gives each one roughly 60px, and "Statements"
 * / "Maintenance" / "Documents" at that width don't fit even at 9-10px
 * type. Truncating them to "Stateme…" / "Maintena…" / "Documen…" (what
 * showed before this) isn't a smaller version of the word, it's an
 * unreadable one - the fix is a genuinely shorter word, not tighter CSS
 * around the long one. "Dashboard", "Vehicles" and "Profile" fit as-is and
 * don't need an override.
 */
const NAV: PanelNavItem[] = [
  { slug: 'dashboard', label: 'Dashboard', path: '/dashboard', group: 'Overview' },
  { slug: 'vehicles', label: 'Vehicles', path: '/vehicles', group: 'Overview' },
  { slug: 'statements', label: 'Statements', mobileLabel: 'Earnings', path: '/statements', group: 'Money' },
  { slug: 'maintenance', label: 'Maintenance', mobileLabel: 'Repairs', path: '/maintenance', group: 'Vehicle care' },
  {
    slug: 'documents',
    label: 'Documents',
    mobileLabel: 'Docs',
    path: '/documents',
    group: 'Vehicle care',
    // Was mobile: false, leaving the mobile bar at 5 items with a real page
    // (title deeds, agreements, insurance docs) reachable only from the
    // desktop sidebar. The mobile bar now takes 6 (see panel-sidebar.tsx -
    // it was hard-capped at 5 with no route behind that number), so there's
    // room for it without crowding anything else out.
  },
  { slug: 'profile', label: 'Payout & profile', mobileLabel: 'Profile', path: '/profile', group: 'Account' },
  // The phone bar is full at six; Returns is reached from a car's page and the dashboard banner there.
  { slug: 'returns', label: 'Returns', path: '/returns', group: 'Account', mobile: false },
];

export function PartnerSidebar() {
  const dash = useQuery({
    queryKey: ['asset-partner-dashboard'],
    queryFn: () => assetPartnerApi.dashboard(),
    staleTime: 60_000,
  });

  // The only count worth badging: maintenance the partner has to decide on.
  // Everything else in this programme happens without them.
  const pending = useQuery({
    queryKey: ['asset-partner-maintenance', 'pending'],
    queryFn: () => assetPartnerApi.maintenance('pending'),
    staleTime: 60_000,
  });

  const items = NAV.map((n) =>
    n.slug === 'maintenance' ? { ...n, count: pending.data?.length } : n,
  );

  const partner = dash.data?.partner;

  return (
    <PanelSidebar
      title={partner?.displayName ?? 'Asset Partner'}
      subtitle={partner ? `${partner.partnerType} · ${partner.status}` : 'Partner portal'}
      icon={Handshake}
      items={items}
      icons={ICONS}
      fallbackIcon={LayoutGrid}
    />
  );
}
