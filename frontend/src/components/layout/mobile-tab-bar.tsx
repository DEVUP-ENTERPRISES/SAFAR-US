'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Heart, Search, CarFront, User, Navigation, MessageSquare, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Logo } from '@/components/layout/logo';
import { useAuthStore } from '@/features/auth/store';
import { useMyBookings } from '@/features/bookings/hooks';
import { useFavoriteIds } from '@/features/favorites/hooks';
import { useUnreadMessages } from '@/features/messaging/hooks';

/**
 * The phone navigation bar.
 *
 * The whole app used to hide behind a hamburger drawer of fourteen entries —
 * a menu, not navigation. This puts the things people actually reach for under
 * the thumb, permanently, so the drawer can shrink to "everything else" (the
 * items here are hidden from it on mobile — see user-menu).
 *
 * Seven slots, three each side of a lifted centre. The left edge is the CATO
 * mark itself as Home, so the brand is present without a logo bar stealing a
 * row. The centre is not a fixed destination: during a live rental the single
 * most important thing in the product is that trip, so the button BECOMES it
 * and pulses; otherwise the most valuable action is finding a car, so it is
 * Search. One button, whichever currently matters.
 */

/** Statuses where a trip is genuinely underway and worth surfacing. */
const LIVE = new Set(['in_progress']);
/** Booked and ahead of you — worth a count, not a takeover. */
const UPCOMING = new Set(['confirmed', 'paid', 'pending_approval', 'pending_verification']);

export function MobileTabBar() {
  const pathname = usePathname() ?? '';
  const user = useAuthStore((s) => s.user);

  // All three are already cached by the pages that use them, so on a warm app
  // this costs nothing extra. Signed-out visitors never fetch any of them.
  const bookings = useMyBookings('guest');
  const favourites = useFavoriteIds();
  const unread = useUnreadMessages(!!user).data?.count ?? 0;

  const list = user ? (bookings.data ?? []) : [];
  const live = list.find((b) => LIVE.has(b.status));
  const upcoming = list.filter((b) => UPCOMING.has(b.status)).length;
  const saved = user ? (favourites.data?.length ?? 0) : 0;

  // The bar is chrome for browsing. On a screen that is already a full-height
  // workspace it would cover the content it is meant to lead to.
  const hidden =
    pathname.startsWith('/host/listings/new') ||
    pathname.startsWith('/trips/') ||
    pathname.startsWith('/messages');
  if (hidden) return null;

  const isOn = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  // Signed-out visitors get a lighter bar — the private tabs would only bounce
  // them to a login. Home · Saved · Search · Trips · Sign in.
  return (
    <>
      {/* Reserves the fixed bar's height so the last row of every page stays
          reachable instead of sitting under the bar. */}
      <div aria-hidden className="h-[calc(4.75rem+env(safe-area-inset-bottom))] lg:hidden" />

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-50 lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="glass relative flex h-[4.75rem] items-stretch border-t border-border/60 px-1">
          <Tab href="/" label="Home" on={isOn('/')} icon={<Logo className="h-6 w-6" />} flat />
          <Tab href="/wishlist" label="Saved" on={isOn('/wishlist')} icon={<Heart />} count={saved} />
          <Tab href="/messages" label="Inbox" on={isOn('/messages')} icon={<MessageSquare />} count={unread} />

          {/* Centre — lifted out so it reads as the primary action. */}
          <CentreButton live={live?._id} />

          <Tab href="/bookings" label="Trips" on={isOn('/bookings')} icon={<CarFront />} count={upcoming} />
          <Tab href="/wallet" label="Wallet" on={isOn('/wallet')} icon={<Wallet />} />
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

function CentreButton({ live }: { live?: string }) {
  const href = live ? `/bookings/${live}` : '/search';
  return (
    <Link
      href={href}
      aria-label={live ? 'Your trip in progress' : 'Search cars'}
      className="relative flex w-[3.75rem] shrink-0 flex-col items-center justify-start"
    >
      <span className="relative -mt-5 grid h-[3.4rem] w-[3.4rem] place-items-center rounded-[1.4rem] bg-primary text-primary-foreground shadow-[0_10px_28px_-6px_hsl(var(--primary)/0.65)] ring-4 ring-background transition-transform duration-200 active:scale-95">
        {/* A halo only while a car is actually out — an idle pulse is noise. */}
        {live && (
          <span className="absolute inset-0 animate-ping rounded-[1.4rem] bg-primary opacity-40 [animation-duration:2.5s]" />
        )}
        <span className="relative">
          {live ? <Navigation className="h-6 w-6" /> : <Search className="h-6 w-6" />}
        </span>
      </span>
      <span className="-mt-4 text-[9px] font-bold tracking-tight text-foreground">
        {live ? 'Trip' : 'Search'}
      </span>
    </Link>
  );
}

function Tab({
  href,
  icon,
  label,
  on,
  count,
  flat,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  on: boolean;
  count?: number;
  /** Home uses the logo, which carries its own colour — don't tint it. */
  flat?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={on ? 'page' : undefined}
      className={cn(
        'relative flex flex-1 flex-col items-center justify-center gap-0.5 pt-2 transition-colors',
        on && !flat ? 'text-primary' : 'text-muted-foreground',
      )}
    >
      <span className="relative">
        <span className="[&>svg]:h-[1.35rem] [&>svg]:w-[1.35rem]">{icon}</span>
        {!!count && count > 0 && (
          <span className="numeric absolute -end-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground ring-2 ring-background">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </span>
      <span className="text-[9.5px] font-semibold tracking-tight">{label}</span>
      {on && <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-primary" />}
    </Link>
  );
}
