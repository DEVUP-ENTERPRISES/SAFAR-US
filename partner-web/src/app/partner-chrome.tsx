'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ExternalLink, LogOut } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { NotificationBell } from '@/components/layout/notification-bell';
import { HostMobileTabBar } from '@/components/layout/host-mobile-tab-bar';
import { RouteProgress } from '@/components/layout/route-progress';
import { PageTransition } from '@/components/layout/page-transition';
import { useAuthStore } from '@/features/auth/store';
import { useLogout } from '@/features/auth/hooks';
import { WORKSPACE_HOME, WORKSPACE_LABEL, useWorkspaces } from '@/features/partner/workspaces';
import { useIsHost } from '@/features/host/hooks';
import { goToSite } from '@/lib/sites';
import { cn } from '@/lib/utils/cn';

const BARE = ['/login', '/register', '/forgot-password', '/handoff', '/host/login', '/corporate/login', '/host/bridge', '/host/accept-invite'];

/** The partner site's frame: brand, the account's workspaces, a way back to the guest site, and sign out. */
export function PartnerChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/';
  const signedIn = useAuthStore((s) => s.status === 'authenticated');
  const { available } = useWorkspaces();
  const isHost = useIsHost();
  const logout = useLogout();

  if (BARE.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6">{children}</main>;
  }

  // A workspace is active anywhere under its section (the Asset Partner home is one level down).
  const active = (home: string) => {
    const section = home === '/asset-partners/dashboard' ? '/asset-partners' : home;
    return pathname === section || pathname.startsWith(`${section}/`);
  };
  const hostMode = !!isHost && (pathname === '/host' || pathname.startsWith('/host/'));

  return (
    <>
      <RouteProgress />
      <header className="fixed inset-x-4 top-4 z-50 mx-auto max-w-7xl rounded-2xl border border-white/10 bg-background/60 shadow-xl shadow-black/10 backdrop-blur-2xl">
        <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <Logo className="h-9 w-9 shrink-0" />
            <span className="display text-xl tracking-tight">CatoDrive</span>
            <span className="hidden rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-primary sm:inline">Partners</span>
          </Link>
          {signedIn && available.length > 1 && (
            <nav className="hidden items-center gap-1 md:flex" aria-label="Workspaces">
              {available.map((w) => (
                <Link
                  key={w}
                  href={WORKSPACE_HOME[w]}
                  className={cn('rounded-full px-3 py-1.5 text-sm font-medium transition-colors', active(WORKSPACE_HOME[w]) ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}
                >
                  {WORKSPACE_LABEL[w]}
                </Link>
              ))}
            </nav>
          )}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => void goToSite('guest', '/')}
              className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium hover:bg-accent sm:inline-flex"
            >
              catodrive.com <ExternalLink className="h-3.5 w-3.5" />
            </button>
            {signedIn && <NotificationBell />}
            {signedIn && (
              <button
                type="button"
                onClick={() => logout.mutate()}
                aria-label="Sign out"
                className="grid h-9 w-9 place-items-center rounded-full hover:bg-accent"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        {signedIn && available.length > 1 && (
          <nav className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden" aria-label="Workspaces">
            {available.map((w) => (
              <Link
                key={w}
                href={WORKSPACE_HOME[w]}
                className={cn('shrink-0 rounded-full px-3 py-1 text-xs font-medium', active(WORKSPACE_HOME[w]) ? 'bg-primary text-primary-foreground' : 'bg-muted')}
              >
                {WORKSPACE_LABEL[w]}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main className={cn('mx-auto w-full max-w-7xl flex-1 px-4 pb-8 sm:px-6', signedIn && available.length > 1 ? 'pt-32 md:pt-24' : 'pt-24')}>
        <PageTransition>{children}</PageTransition>
      </main>
      {hostMode ? <HostMobileTabBar /> : null}
    </>
  );
}
