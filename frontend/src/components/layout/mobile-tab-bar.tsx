'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Compass, Heart, Search, CarFront, User, Navigation } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/features/auth/store';
import { useMyBookings } from '@/features/bookings/hooks';
import { useFavoriteIds } from '@/features/favorites/hooks';

/**
 * The phone navigation bar.
 *
 * Everything below the marketing pages was reachable only through a hamburger
 * drawer — the screenshot of that drawer has fourteen entries in it, which is a
 * menu, not navigation. On a phone the four or five things people actually do
 * belong under the thumb, permanently, and the rest can stay in the drawer.
 *
 * The centre slot is deliberately not a fixed destination. During a live rental
 * the single most important thing on this whole product is the trip in
 * progress — where the car is, the handover, the return — so that is what the
 * button becomes, and it pulses to say so. With no trip running there is
 * nothing to return to, and the most valuable action is finding a car, so it
 * is Search. One button, whichever of the two currently matters.
 */

/** Statuses where a trip is genuinely underway and worth surfacing. */
const LIVE = new Set(['in_progress']);
/** Booked and ahead of you — worth a count, not a takeover. */
const UPCOMING = new Set(['confirmed', 'paid', 'pending_approval', 'pending_verification']);

export function MobileTabBar() {
  const pathname = usePathname() ?? '';
  const user = useAuthStore((s) => s.user);

  // Both are already cached by the pages that use them, so on a warm app this
  // costs nothing extra. Signed-out visitors never fetch either.
  const bookings = useMyBookings('guest');
  const favourites = useFavoriteIds();

  const list = user ? (bookings.data ?? []) : [];
  const live = list.find((b) => LIVE.has(b.status));
  const upcoming = list.filter((b) => UPCOMING.has(b.status)).length;
  const saved = user ? (favourites.data?.length ?? 0) : 0;

  // The bar is chrome for browsing. On a screen that is already a full-height
  // workspace — the listing wizard, a live trip map — it would cover the
  // content it is meant to lead to.
  const hidden =
    pathname.startsWith('/host/listings/new') ||
    pathname.startsWith('/trips/') ||
    pathname.startsWith('/messages');
  if (hidden) return null;

  const isOn = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* Reserves the space the fixed bar occupies, so the last row of every
          page stays reachable instead of sitting under the bar forever. */}
      <div aria-hidden className="h-[calc(4.5rem+env(safe-area-inset-bottom))] lg:hidden" />

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-50 lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="glass relative flex h-[4.5rem] items-stretch justify-around border-t border-border/60">
          <Tab href="/" icon={<Compass />} label="Explore" on={isOn('/')} />
          <Tab href="/wishlist" icon={<Heart />} label="Saved" on={isOn('/wishlist')} count={saved} />

          {/* Centre. Lifted out of the bar so it reads as the primary action
              rather than one of five equals. */}
          <CentreButton live={live?._id} />

          <Tab href="/bookings" icon={<CarFront />} label="Trips" on={isOn('/bookings')} count={upcoming} />
          <Tab
            href={user ? '/account' : '/login'}
            icon={<User />}
            label={user ? 'Account' : 'Sign in'}
            on={isOn('/account')}
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
      className="relative -mt-6 flex w-[22%] flex-col items-center justify-start"
    >
      <span className="relative grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_24px_-6px_hsl(var(--primary)/0.6)] ring-4 ring-background transition-transform duration-200 active:scale-95">
        {/* A halo only while something is actually happening. An idle pulse is
            noise; this one means a car is out. */}
        {live && (
          <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-40 [animation-duration:2.5s]" />
        )}
        <span className="relative">
          {live ? <Navigation className="h-6 w-6" /> : <Search className="h-6 w-6" />}
        </span>
      </span>
      <span className="mt-1 text-[10px] font-bold tracking-tight text-foreground">
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
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  on: boolean;
  count?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={on ? 'page' : undefined}
      className={cn(
        'relative flex flex-1 flex-col items-center justify-center gap-1 pt-2 transition-colors',
        on ? 'text-primary' : 'text-muted-foreground',
      )}
    >
      <span className="relative">
        {/* h-5 w-5 on the icon regardless of which lucide glyph was passed. */}
        <span className="[&>svg]:h-5 [&>svg]:w-5">{icon}</span>
        {!!count && count > 0 && (
          <span className="numeric absolute -end-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground ring-2 ring-background">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </span>
      <span className="text-[10px] font-semibold tracking-tight">{label}</span>
      {on && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-primary" />}
    </Link>
  );
}
