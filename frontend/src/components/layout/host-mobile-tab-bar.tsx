'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, CarFront, ClipboardList, Wallet, MessageSquare, User } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/features/auth/store';
import { useUnreadMessages } from '@/features/messaging/hooks';

/**
 * The HOST phone navigation bar — the mobile workspace for someone managing
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
  /** Active only on an exact match — for the dashboard root, which prefixes
   *  every other host route. */
  exact?: boolean;
  count?: number;
}

export function HostMobileTabBar() {
  const pathname = usePathname() ?? '';
  const user = useAuthStore((s) => s.user);
  const unread = useUnreadMessages(!!user).data?.count ?? 0;

  // Full-height workspaces and the host sign-in render without the bar.
  const hidden =
    pathname.startsWith('/host/listings/new') || pathname.startsWith('/host/login');
  if (hidden) return null;

  const tabs: HostTab[] = [
    { href: '/host', label: 'Dashboard', icon: <LayoutGrid />, exact: true },
    { href: '/host/trips', label: 'Trips', icon: <CarFront /> },
    { href: '/host/listings', label: 'Listings', icon: <ClipboardList /> },
    { href: '/host/earnings', label: 'Earnings', icon: <Wallet /> },
    { href: '/host/inbox', label: 'Inbox', icon: <MessageSquare />, count: unread },
    { href: '/host/profile', label: 'Menu', icon: <User /> },
  ];

  const isOn = (t: HostTab) =>
    t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);

  return (
    <>
      <div aria-hidden className="h-[calc(4rem+env(safe-area-inset-bottom))] lg:hidden" />

      <nav
        aria-label="Host"
        className="fixed inset-x-0 bottom-0 z-50 lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="glass flex h-16 items-stretch border-t border-border/60">
          {tabs.map((t) => (
            <Tab key={t.href} {...t} on={isOn(t)} />
          ))}
        </div>
      </nav>
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
