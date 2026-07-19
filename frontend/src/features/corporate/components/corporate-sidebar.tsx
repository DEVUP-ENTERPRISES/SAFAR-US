'use client';

import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, Users, Wallet, ScrollText, CheckSquare, FileText, LayoutGrid, Building2,
} from 'lucide-react';
import { PanelSidebar, type PanelNavItem } from '@/components/layout/panel-sidebar';
import { corporateApi } from '@/features/corporate/api';

const ICONS = {
  dashboard: LayoutDashboard,
  members: Users,
  'cost-centers': Wallet,
  policy: ScrollText,
  approvals: CheckSquare,
  invoices: FileText,
};

const NAV: PanelNavItem[] = [
  { slug: 'dashboard', label: 'Dashboard', path: '/corporate', group: 'Overview' },
  { slug: 'members', label: 'Members', path: '/corporate/members', group: 'Manage' },
  { slug: 'cost-centers', label: 'Cost centers', path: '/corporate/cost-centers', group: 'Manage' },
  { slug: 'policy', label: 'Travel policy', path: '/corporate/policy', group: 'Manage' },
  { slug: 'approvals', label: 'Approvals', path: '/corporate/approvals', group: 'Finance' },
  { slug: 'invoices', label: 'Invoices', path: '/corporate/invoices', group: 'Finance' },
];

export function CorporateSidebar() {
  const me = useQuery({ queryKey: ['corp-me'], queryFn: () => corporateApi.me(), retry: false });
  // Surface pending approvals as a live badge — the one queue that blocks travel.
  const pendingRequests = useQuery({
    queryKey: ['corp-requests', 'pending'],
    queryFn: () => corporateApi.requests('pending'),
    retry: false,
  });

  const items = NAV.map((n) =>
    n.slug === 'approvals' ? { ...n, count: pendingRequests.data?.length } : n,
  );

  return (
    <PanelSidebar
      title={me.data?.org.name ?? 'Corporate'}
      subtitle="Business travel"
      icon={Building2}
      items={items}
      icons={ICONS}
      fallbackIcon={LayoutGrid}
      exactPaths={['/corporate']}
    />
  );
}
