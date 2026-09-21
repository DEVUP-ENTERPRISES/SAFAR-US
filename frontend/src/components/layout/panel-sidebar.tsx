'use client';

import { type ComponentType } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

export interface PanelNavItem {
  slug: string;
  label: string;
  path: string;
  group: string;
  /** Optional count badge — e.g. pending items in a queue. */
  count?: number;
  /** Whether to show this item in the mobile bottom nav. Defaults to true. */
  mobile?: boolean;
  /**
   * Shorter label for the mobile bottom bar, where five items share one row
   * and a two-or-three-word label ("Payout & profile") wraps onto a second
   * line while its neighbours stay on one — the row's icons and labels then
   * sit at different heights instead of a shared baseline. Falls back to
   * `label`, so this only needs setting where the full label is too long.
   */
  mobileLabel?: string;
}

/**
 * One sidebar for every panel (admin / host / corporate). Panels differ only in
 * their brand header and nav items — the chrome, grouping, active state and
 * responsive behaviour are shared, so the three panels can't drift apart.
 */
export function PanelSidebar({
  title,
  subtitle,
  icon: Icon,
  items,
  icons,
  fallbackIcon: FallbackIcon,
  exactPaths = [],
  pinned = false,
  top = '5rem',
  height = 'calc(100vh - 5.5rem)',
  showMobileNav = true,
}: {
  title: string;
  subtitle?: string;
  icon: ComponentType<{ className?: string }>;
  items: PanelNavItem[];
  /** slug → icon */
  icons: Record<string, ComponentType<{ className?: string }>>;
  fallbackIcon: ComponentType<{ className?: string }>;
  /** Paths that should only be active on an exact match (e.g. panel roots). */
  exactPaths?: string[];
  /**
   * Pin to the viewport rather than sticking within page flow.
   *
   * A pinned sidebar cannot be dislodged by an ancestor that happens to
   * establish a scroll container — the failure mode `sticky` has, where the
   * nav silently scrolls away with a long page. The caller MUST reserve the
   * w-60 gutter itself, since a fixed element takes up no layout space.
   */
  pinned?: boolean;
  /** Where the sidebar starts — the height of this panel's topbar. */
  top?: string;
  /** How tall it is. Defaults leave a little breathing room at the bottom. */
  height?: string;
  /**
   * False when the caller already has its own dedicated mobile bottom bar
   * elsewhere in the tree — HostSidebar is the one caller that does
   * (HostMobileTabBar, rendered by AppChrome for every /host/* route). Both
   * are `fixed inset-x-0 bottom-0`, so without this every host dashboard
   * page mounted two bottom navs stacked on top of each other on mobile: the
   * same double-fixed-bar bug already found and fixed on the Asset Partner
   * portal and on /vehicles/[id], just one more place it was hiding.
   */
  showMobileNav?: boolean;
}) {
  const pathname = usePathname();

  // Group in declared order.
  const groups: { name: string; items: PanelNavItem[] }[] = [];
  for (const it of items) {
    let g = groups.find((x) => x.name === it.group);
    if (!g) {
      g = { name: it.group, items: [] };
      groups.push(g);
    }
    g.items.push(it);
  }

  const desktopSidebar = (
    // Offsets are per-panel, not hardcoded: the consumer navbar floats at top-4
    // and is h-14 (so it occupies 16-72px), while the admin and host topbars sit
    // flush at top-0 with their own heights. One set of numbers cannot be right
    // for all three — a sidebar tuned for the consumer chrome left a gap under
    // the admin topbar and ran past the bottom of the viewport.
    <aside
      style={{ top, height }}
      className={cn(
        'hide-scrollbar hidden w-60 shrink-0 overflow-y-auto overscroll-contain border-e border-border py-5 pe-4 md:block',
        pinned ? 'fixed start-0 z-30' : 'sticky',
      )}
    >
      {/* Panel brand header — makes it unmistakable which panel you're in. */}
      <div className="mb-5 flex items-center gap-3 px-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-black tracking-tight text-foreground">{title}</p>
          {subtitle && <p className="truncate text-xs font-medium text-muted-foreground/80">{subtitle}</p>}
        </div>
      </div>

      {groups.map((g) => (
        <div key={g.name} className="mb-4">
          <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">
            {g.name}
          </p>
          <nav className="space-y-0.5">
            {g.items.map((n) => {
              const NavIcon = icons[n.slug] ?? FallbackIcon;
              const active = exactPaths.includes(n.path)
                ? pathname === n.path
                : pathname === n.path || pathname.startsWith(`${n.path}/`);
              return (
                <Link
                  key={n.slug}
                  href={n.path}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-all',
                    active
                      ? 'bg-primary/10 text-primary shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] ring-1 ring-primary/20'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {/* Active rail */}
                  {active && (
                    <span className="absolute inset-y-2 start-0 w-1.5 rounded-e-full bg-primary" />
                  )}
                  <NavIcon className={cn('h-4.5 w-4.5 shrink-0', active ? 'text-primary' : 'text-muted-foreground/70')} />
                  <span className="truncate">{n.label}</span>
                  {typeof n.count === 'number' && n.count > 0 && (
                    <span className="ms-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                      {n.count > 99 ? '99+' : n.count}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      ))}
    </aside>
  );

  /*
   * 6, matching the guest tab bar's own convention (see mobile-tab-bar.tsx),
   * not 5 — this was an arbitrary lower cap with no route behind it, and it
   * silently dropped a real page (Documents) off the partner nav even though
   * nothing about the layout required stopping at 5.
   */
  const mobileItems = items.filter((i) => i.mobile !== false).slice(0, 6);

  const mobileNav = (
    /*
     * items-stretch + flex-1 per item (not items-center + justify-around +
     * min-w-[64px]) — the same pattern mobile-tab-bar.tsx already uses for
     * the guest nav. min-w+justify-around gives every item its OWN width and
     * lets the row distribute the leftover space as gaps, so the columns
     * don't line up between this bar and any other bottom bar on the site,
     * and it gets tight fast once a 6th item is added (6 x 64px is most of a
     * phone's width before any padding). flex-1 forces genuinely equal
     * columns regardless of item count.
     */
    <nav className="fixed inset-x-0 bottom-0 z-50 flex h-16 items-stretch border-t border-border bg-card/95 pb-safe backdrop-blur md:hidden">
      {mobileItems.map((n) => {
        const NavIcon = icons[n.slug] ?? FallbackIcon;
        const active = exactPaths.includes(n.path)
          ? pathname === n.path
          : pathname === n.path || pathname.startsWith(`${n.path}/`);

        return (
          <Link
            key={n.slug}
            href={n.path}
            className={cn(
              // min-w-0 is load-bearing, not decoration: flex items default
              // to min-width:auto, which stops a child from shrinking below
              // its own content's natural width. Without it, a label like
              // "Statements" or "Maintenance" refuses to respect its 1/6
              // share of the row and pushes into the next column instead of
              // truncating — flex-1 was setting the INTENDED width, but the
              // browser was overriding it back to "however wide the text
              // wants to be," which is exactly why the labels ran together.
              'flex flex-1 min-w-0 flex-col items-center justify-center gap-1 px-0.5 transition-colors',
              active ? 'text-primary' : 'text-muted-foreground/70 hover:text-foreground'
            )}
          >
            <div className="relative">
              <NavIcon className="h-6 w-6" />
              {typeof n.count === 'number' && n.count > 0 && (
                <span className="absolute -end-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                  {n.count > 99 ? '99+' : n.count}
                </span>
              )}
            </div>
            {/*
              truncate (not wrap): five items share one row on a ~360-400px
              screen, so anything longer than one short word has to be given
              a mobileLabel override rather than allowed to wrap — a wrapped
              label is taller than its one-line neighbours, and the row's
              icons stop sharing a baseline. This is the safety net for
              whatever the next caller forgets to shorten.
            */}
            {/*
              w-full, not max-w-[70px]: a flat 70px cap only clips a label
              once it EXCEEDS 70px — on a narrow phone with 6 columns, a
              column can be genuinely narrower than that (390px / 6 columns
              is ~65px before padding), so a "70px-or-less" label was never
              being clipped at all and visually spilled past its own column.
              w-full ties truncation to this column's REAL width at any
              screen size, whatever that number happens to be.
            */}
            <span className="w-full truncate text-center text-[10px] font-bold">{n.mobileLabel ?? n.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {desktopSidebar}
      {showMobileNav && mobileNav}
    </>
  );
}
