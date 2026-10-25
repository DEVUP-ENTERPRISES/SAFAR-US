'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, CarFront, ClipboardList, MessageSquare, Handshake, Menu } from 'lucide-react';
import { NavSheet, type NavSheetItem } from '@/components/layout/nav-sheet';
import { ICONS, NAV } from '~/features/host/components/host-sidebar';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/features/auth/store';
import { useAttention } from '~/features/host/use-attention';

/**
 * The HOST phone navigation bar - the mobile workspace for someone managing
 * their fleet. Its own component (not a mode inside the guest bar): a host on
 * their dashboard should see host chrome, so AppChrome mounts this instead of
 * the guest MobileTabBar while inside /host/*.
 *
 * Six equal tabs mirroring the host dashboard: Dashboard, Trips, Listings,
 * Earnings, Inbox, Menu. Same visual language as the guest bar so the app feels
 * like one product, but every destination is a host surface.
 */

interface HostTab {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Active only on an exact match - for the dashboard root, which prefixes
   *  every other host route. */
  exact?: boolean;
  count?: number;
}

export function HostMobileTabBar() {
  const pathname = usePathname() ?? '';
  const user = useAuthStore((s) => s.user);
  const attention = useAttention(!!user);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // Full-height workspaces and the host sign-in render without the bar.
  const hidden =
    pathname.startsWith('/ops/listings/new') || pathname.startsWith('/ops/login');
  if (hidden) return null;

  const tabs: HostTab[] = [
    { href: '/ops', label: 'Dashboard', icon: <LayoutGrid />, exact: true },
    { href: '/ops/trips', label: 'Trips', icon: <CarFront />, count: attention.trips },
    { href: '/ops/inbox', label: 'Inbox', icon: <MessageSquare />, count: attention.inbox },
    { href: '/ops/listings', label: 'Listings', icon: <ClipboardList /> },
    { href: '/ops/partners', label: 'Assets', icon: <Handshake />, count: attention.partners },
  ];

  const isOn = (t: HostTab) =>
    t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
  const inMenu = (n: NavSheetItem) => (n.path === '/ops' ? pathname === '/ops' : pathname === n.path || pathname.startsWith(`${n.path}/`));
  const menuActive = !tabs.some(isOn);

  return (
    <>
      <div aria-hidden className="h-[calc(4rem+env(safe-area-inset-bottom))] lg:hidden" />

      <nav
        aria-label="Operations"
        className="fixed inset-x-0 bottom-0 z-50 lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="glass flex h-16 items-stretch border-t border-border/60">
          {tabs.map((t) => (
            <Tab key={t.href} {...t} on={isOn(t)} />
          ))}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            className={cn('relative flex flex-1 flex-col items-center justify-center gap-1 transition-colors', menuActive ? 'text-primary' : 'text-muted-foreground')}
          >
            <Menu className="h-[1.4rem] w-[1.4rem]" />
            <span className="text-[10px] font-semibold tracking-tight">More</span>
            {menuActive && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-primary" />}
          </button>
        </div>
      </nav>
      <NavSheet open={menuOpen} onClose={closeMenu} title="Operations" items={NAV} icons={ICONS} fallbackIcon={LayoutGrid} isActive={inMenu} className="lg:hidden" />
    </>
  );
}

function Tab({ href, icon, label, on, count }: HostTab & { on: boolean }) {
  return (
    <Link
      href={href}
      aria-current={on ? 'page' : undefined}
      className={cn(
        'relative flex flex-1 flex-col items-center justify-center gap-1 transition-colors',
        on ? 'text-primary' : 'text-muted-foreground',
      )}
    >
      <span className="relative">
        <span className="[&>svg]:h-[1.4rem] [&>svg]:w-[1.4rem]">{icon}</span>
        {!!count && count > 0 && (
          <span className="numeric absolute -end-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground ring-2 ring-background">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </span>
      <span className="text-[10px] font-semibold tracking-tight">{label}</span>
      {on && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-primary" />}
    </Link>
  );
}
