'use client';

import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, Car, FileText, Wrench, FolderLock, User, LayoutGrid, Handshake,
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
};

const NAV: PanelNavItem[] = [
  { slug: 'dashboard', label: 'Dashboard', path: '/asset-partners/dashboard', group: 'Overview' },
  { slug: 'vehicles', label: 'Vehicles', path: '/asset-partners/vehicles', group: 'Overview' },
  { slug: 'statements', label: 'Statements', path: '/asset-partners/statements', group: 'Money' },
  { slug: 'maintenance', label: 'Maintenance', path: '/asset-partners/maintenance', group: 'Vehicle care' },
  { slug: 'documents', label: 'Documents', path: '/asset-partners/documents', group: 'Vehicle care', mobile: false },
  { slug: 'profile', label: 'Payout & profile', mobileLabel: 'Profile', path: '/asset-partners/profile', group: 'Account' },
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
