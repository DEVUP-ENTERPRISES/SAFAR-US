'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Heart, Search, CarFront, User, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Logo } from '@/components/layout/logo';
import { useAuthStore } from '@/features/auth/store';
import { useMyBookings } from '@/features/bookings/hooks';
import { useFavoriteIds } from '@/features/favorites/hooks';
import { useUnreadMessages } from '@/features/messaging/hooks';

/**
 * The phone navigation bar.
 *
 * Six equal tabs — no lifted centre, nothing oversized. Product call: the core
 * loop of a rental marketplace is browse → search → save → trip → talk →
 * manage, so those are the six, and Home is the CATO mark itself so the brand
 * is present without a logo row stealing space. Everything else lives in the
 * account drawer, which hides these six on mobile so nothing shows twice.
 *
 * The live trip is not given its own giant button; instead the Trips tab quietly
 * pulses while a car is out, which is enough of a signal and keeps every tab the
 * same weight.
 */

const LIVE = new Set(['in_progress']);
const UPCOMING = new Set(['confirmed', 'paid', 'pending_approval', 'pending_verification']);

export function MobileTabBar() {
  const pathname = usePathname() ?? '';
  const user = useAuthStore((s) => s.user);

  const bookings = useMyBookings('guest');
  const favourites = useFavoriteIds();
  const unread = useUnreadMessages(!!user).data?.count ?? 0;

  const list = user ? (bookings.data ?? []) : [];
  const hasLive = list.some((b) => LIVE.has(b.status));
  const upcoming = list.filter((b) => UPCOMING.has(b.status)).length;
  const saved = user ? (favourites.data?.length ?? 0) : 0;

  // Chrome for browsing — hidden where the screen is already a full-height
  // workspace it would only cover.
  const hidden =
    pathname.startsWith('/host/listings/new') ||
    pathname.startsWith('/trips/') ||
    pathname.startsWith('/messages');
  if (hidden) return null;

  const isOn = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* Reserves the fixed bar's height so the last row of every page stays
          reachable rather than sitting under the bar. */}
      <div aria-hidden className="h-[calc(4rem+env(safe-area-inset-bottom))] lg:hidden" />

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-50 lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="glass flex h-16 items-stretch border-t border-border/60">
          <Tab href="/" label="Home" on={isOn('/')} icon={<Logo className="h-[1.4rem] w-[1.4rem]" />} flat />
          <Tab href="/search" label="Search" on={isOn('/search')} icon={<Search />} />
          <Tab href="/wishlist" label="Saved" on={isOn('/wishlist')} icon={<Heart />} count={saved} />
          <Tab href="/bookings" label="Trips" on={isOn('/bookings')} icon={<CarFront />} count={upcoming} live={hasLive} />
          <Tab href="/messages" label="Inbox" on={isOn('/messages')} icon={<MessageSquare />} count={unread} />
          <Tab
            href={user ? '/account' : '/login'}
            label={user ? 'Account' : 'Sign in'}
            on={isOn('/account')}
            icon={<User />}
          />
        </div>
      </nav>
    </>
  );
}

function Tab({
  href,
  icon,
  label,
  on,
  count,
  live,
  flat,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  on: boolean;
  count?: number;
  /** A car is out — pulse this tab. */
  live?: boolean;
  /** Home uses the logo, which carries its own colour — don't tint it active. */
  flat?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={on ? 'page' : undefined}
      className={cn(
        'relative flex flex-1 flex-col items-center justify-center gap-1 transition-colors',
        on && !flat ? 'text-primary' : 'text-muted-foreground',
      )}
    >
      <span className="relative">
        <span className="[&>svg]:h-[1.4rem] [&>svg]:w-[1.4rem]">{icon}</span>

        {/* A live trip: a small pulsing dot, no takeover. */}
        {live && (
          <span className="absolute -end-1 -top-0.5 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background" />
          </span>
        )}

        {/* A count badge (suppressed while the live dot is showing, so they
            don't stack on the same corner). */}
        {!live && !!count && count > 0 && (
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
