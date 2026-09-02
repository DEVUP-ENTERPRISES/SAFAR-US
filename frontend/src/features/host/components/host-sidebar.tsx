'use client';

import { LayoutDashboard, Car, TrendingUp, Layers, Wrench, User, LayoutGrid, Store, Route, BarChart3, Users } from 'lucide-react';
import { PanelSidebar } from '@/components/layout/panel-sidebar';
import { useHostMe } from '@/features/host/hooks';

const ICONS = {
  dashboard: LayoutDashboard,
  trips: Route,
  listings: Car,
  performance: BarChart3,
  earnings: TrendingUp,
  fleet: Layers,
  operations: Wrench,
  team: Users,
  profile: User,
};

const NAV = [
  { slug: 'dashboard', label: 'Dashboard', path: '/host', group: 'Overview' },
  { slug: 'trips', label: 'Trips', path: '/host/trips', group: 'Overview' },
  { slug: 'inbox', label: 'Inbox', path: '/host/inbox', group: 'Overview' },
  { slug: 'listings', label: 'Listings', path: '/host/listings', group: 'Manage' },
  { slug: 'fleet', label: 'Fleet', path: '/host/fleet', group: 'Manage', mobile: false },
  { slug: 'operations', label: 'Operations', path: '/host/operations', group: 'Manage', mobile: false },
  { slug: 'team', label: 'Captains', path: '/host/team', group: 'Manage', mobile: false },
  { slug: 'earnings', label: 'Earnings', path: '/host/earnings', group: 'Money' },
  { slug: 'performance', label: 'Performance', path: '/host/performance', group: 'Money', mobile: false },
  { slug: 'profile', label: 'Profile', path: '/host/profile', group: 'Account' },
];

export function HostSidebar() {
  const host = useHostMe();

  return (
    <PanelSidebar
      title={host.data?.displayName ?? 'Host'}
      subtitle={host.data?.isSuperhost ? 'Superhost' : 'Host dashboard'}
      icon={Store}
      items={NAV}
      icons={ICONS}
      fallbackIcon={LayoutGrid}
      exactPaths={['/host']}
    />
  );
}
