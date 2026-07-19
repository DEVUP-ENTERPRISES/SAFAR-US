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
    <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 overflow-y-auto border-r border-border py-6 pr-4 md:block">
      {/* Panel brand header — makes it unmistakable which panel you're in. */}
      <div className="mb-8 flex items-center gap-3 px-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-black tracking-tight text-foreground">{title}</p>
          {subtitle && <p className="truncate text-xs font-medium text-muted-foreground/80">{subtitle}</p>}
        </div>
      </div>

      {groups.map((g) => (
        <div key={g.name} className="mb-6">
          <p className="px-3 pb-2.5 text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">
            {g.name}
          </p>
          <nav className="space-y-1">
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
                    'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all',
                    active
                      ? 'bg-primary/10 text-primary shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] ring-1 ring-primary/20'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {/* Active rail */}
                  {active && (
                    <span className="absolute inset-y-2 left-0 w-1.5 rounded-r-full bg-primary" />
                  )}
                  <NavIcon className={cn('h-4.5 w-4.5 shrink-0', active ? 'text-primary' : 'text-muted-foreground/70')} />
                  <span className="truncate">{n.label}</span>
                  {typeof n.count === 'number' && n.count > 0 && (
                    <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
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

  const mobileItems = items.filter((i) => i.mobile !== false).slice(0, 5);

  const mobileNav = (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-around border-t border-border bg-card/95 px-2 pb-safe pt-2 backdrop-blur md:hidden">
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
              'flex flex-col items-center justify-center gap-1 min-w-[64px] px-2 py-1 transition-colors',
              active ? 'text-primary' : 'text-muted-foreground/70 hover:text-foreground'
            )}
          >
            <div className="relative">
              <NavIcon className="h-6 w-6" />
              {typeof n.count === 'number' && n.count > 0 && (
                <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                  {n.count > 99 ? '99+' : n.count}
                </span>
              )}
            </div>
            <span className="text-[10px] font-bold">{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {desktopSidebar}
      {mobileNav}
    </>
  );
}
