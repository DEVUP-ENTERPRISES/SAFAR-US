'use client';

import { LayoutDashboard, Car, TrendingUp, Wrench, User, LayoutGrid, Store, Route, BarChart3, Users, Milestone, Handshake, Inbox } from 'lucide-react';
import { PanelSidebar } from '@/components/layout/panel-sidebar';
import { useHostMe } from '~/features/host/hooks';
import { useAttention } from '~/features/host/use-attention';

export const ICONS = {
  dashboard: LayoutDashboard,
  trips: Route,
  inbox: Inbox,
  listings: Car,
  performance: BarChart3,
  earnings: TrendingUp,
  operations: Wrench,
  team: Users,
  tolls: Milestone,
  partners: Handshake,
  profile: User,
};

export const NAV = [
  { slug: 'dashboard', label: 'Dashboard', path: '/ops', group: 'Overview' },
  { slug: 'trips', label: 'Trips', path: '/ops/trips', group: 'Overview' },
  { slug: 'inbox', label: 'Inbox', path: '/ops/inbox', group: 'Overview' },
  { slug: 'listings', label: 'Listings', path: '/ops/listings', group: 'Manage' },
  { slug: 'operations', label: 'Operations', path: '/ops/operations', group: 'Manage', mobile: false },
  { slug: 'partners', label: 'Asset management', path: '/ops/partners', group: 'Manage', mobile: false },
  { slug: 'team', label: 'Captains', path: '/ops/team', group: 'Manage', mobile: false },
  { slug: 'tolls', label: 'Toll accounts', path: '/ops/tolls', group: 'Manage' },
  { slug: 'earnings', label: 'Earnings', path: '/ops/earnings', group: 'Money' },
  { slug: 'performance', label: 'Performance', path: '/ops/performance', group: 'Money', mobile: false },
  { slug: 'profile', label: 'Profile', path: '/ops/profile', group: 'Account' },
];

export function HostSidebar() {
  const host = useHostMe();
  const attention = useAttention(!!host.data);
  const counts: Record<string, number> = { trips: attention.trips, inbox: attention.inbox, partners: attention.partners };
  const items = NAV.map((n) => (counts[n.slug] ? { ...n, count: counts[n.slug] } : n));

  return (
    <PanelSidebar
      title={host.data?.displayName ?? 'CatoDrive'}
      subtitle="Operations panel"
      icon={Store}
      items={items}
      icons={ICONS}
      fallbackIcon={LayoutGrid}
      exactPaths={['/ops']}
      // HostMobileTabBar already covers the mobile bottom nav for every
      // /host/* route (rendered by AppChrome) - without this, that bar and
      // PanelSidebar's own default one stacked on top of each other.
      showMobileNav={false}
    />
  );
}
