'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, LogOut } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { NotificationBell } from '@/components/layout/notification-bell';
import { HostMobileTabBar } from '~/components/layout/host-mobile-tab-bar';
import { RouteProgress } from '@/components/layout/route-progress';
import { PageTransition } from '@/components/layout/page-transition';
import { useAuthStore } from '@/features/auth/store';
import { useLogout } from '@/features/auth/hooks';
import { useIsHost } from '~/features/host/hooks';
import { captainApi } from '~/features/host/team-api';
import { goToSite } from '@/lib/sites';
import { cn } from '@/lib/utils/cn';

// Full-screen pages: sign-in, the cross-site handoff, House Fleet's bridge and a captain's invite.
const BARE = ['/sign-in', '/forgot-password', '/handoff', '/ops/bridge'];

/** CatoDrive's operations panel frame: Host and Captain when the account is both, a way back to catodrive.com, and sign out. */
export function IocChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/';
  const signedIn = useAuthStore((s) => s.status === 'authenticated');
  const isHost = useIsHost();
  const captain = useQuery({ queryKey: ['captain-queue'], queryFn: () => captainApi.queue(), enabled: signedIn, retry: false });
  const logout = useLogout();

  if (BARE.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6">{children}</main>;
  }

  const inHost = pathname === '/ops' || pathname.startsWith('/ops/');
  const sections = [
    ...(isHost ? [{ href: '/ops', label: 'Operations' }] : []),
    ...(captain.data ? [{ href: '/captain', label: 'Captain' }] : []),
  ];
  const showNav = signedIn && sections.length > 1;
  const tab = (s: { href: string; label: string }, base: string) => {
    const on = pathname === s.href || pathname.startsWith(`${s.href}/`);
    return (
      <Link key={s.href} href={s.href} className={cn(base, on ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}>
        {s.label}
      </Link>
    );
  };

  return (
    <>
      <RouteProgress />
      <header className="fixed inset-x-4 top-4 z-50 mx-auto max-w-7xl rounded-2xl border border-white/10 bg-background/60 shadow-xl shadow-black/10 backdrop-blur-2xl">
        <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <Logo className="h-9 w-9 shrink-0" />
            <span className="display text-xl tracking-tight">CatoDrive</span>
            <span className="hidden rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-primary sm:inline">Operations</span>
          </Link>
          {showNav && (
            <nav className="hidden items-center gap-1 md:flex" aria-label="Sections">
              {sections.map((s) => tab(s, 'rounded-full px-3 py-1.5 text-sm font-medium transition-colors'))}
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
              <button type="button" onClick={() => logout.mutate()} aria-label="Sign out" className="grid h-9 w-9 place-items-center rounded-full hover:bg-accent">
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        {showNav && (
          <nav className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden" aria-label="Sections">
            {sections.map((s) => tab(s, 'shrink-0 rounded-full px-3 py-1 text-xs font-medium'))}
          </nav>
        )}
      </header>
      <main className={cn('mx-auto w-full max-w-7xl flex-1 px-4 pb-8 sm:px-6', showNav ? 'pt-32 md:pt-24' : 'pt-24')}>
        <PageTransition>{children}</PageTransition>
      </main>
      {isHost && inHost ? <HostMobileTabBar /> : null}
    </>
  );
}
