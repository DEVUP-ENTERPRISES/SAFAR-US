'use client';

import { type ComponentType } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, Users, BadgeCheck, Car, CalendarCheck, ShieldAlert, LifeBuoy,
  ScanFace, Flag, ScrollText, LayoutGrid, Shield, Percent, SlidersHorizontal, TrendingUp, Star, Layers, Building2, Banknote, Route,
} from 'lucide-react';
import { PanelSidebar, type PanelNavItem } from '@/components/layout/panel-sidebar';
import { adminApi, type AdminNavItem } from '@/features/admin/api';
import { adminPath } from '@/lib/admin-path';

// Map backend slugs → icons (backend owns the routes; UI owns the icons).
const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  users: Users,
  kyc: ScanFace,
  hosts: BadgeCheck,
  vehicles: Car,
  bookings: CalendarCheck,
  claims: ShieldAlert,
  support: LifeBuoy,
  commission: Percent,
  finance: TrendingUp,
  economics: SlidersHorizontal,
  surge: TrendingUp,
  memberships: Star,
  'feature-flags': Flag,
  fleets: Layers,
  corporate: Building2,
  payouts: Banknote,
  reviews: Star,
  trips: Route,
  audit: ScrollText,
};

export function AdminSidebar() {
  const { data } = useQuery({ queryKey: ['admin-nav'], queryFn: () => adminApi.nav(), staleTime: 300_000 });
  // Live queue counts — the sidebar shows real work waiting, not static labels.
  const { data: metrics } = useQuery({
    queryKey: ['admin-metrics'],
    queryFn: () => adminApi.metrics(),
    refetchInterval: 30_000,
  });

  // Backend returns {slug,path,...}; dedupe by path (e.g. dashboard+analytics share /admin).
  const deduped = (data ?? []).reduce<AdminNavItem[]>((acc, it) => {
    if (!acc.some((x) => x.path === it.path)) acc.push(it);
    return acc;
  }, []);

  const COUNTS: Record<string, number | undefined> = {
    hosts: metrics?.hosts.pending,
    vehicles: metrics?.vehicles.pendingVerification,
    claims: metrics?.claims.open,
    support: metrics?.tickets.open,
  };

  const items: PanelNavItem[] = deduped.map((n) => ({ ...n, count: COUNTS[n.slug] }));

  return (
    <PanelSidebar
      title="Admin"
      subtitle="Platform control"
      icon={Shield}
      items={items}
      icons={ICONS}
      fallbackIcon={LayoutGrid}
      exactPaths={[adminPath()]}
    />
  );
}
