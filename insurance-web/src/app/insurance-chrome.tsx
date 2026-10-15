'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { AuthGuard } from '@/components/layout/auth-guard';
import { NotificationBell } from '@/components/layout/notification-bell';
import { RouteProgress } from '@/components/layout/route-progress';
import { useLogout } from '@/features/auth/hooks';
import type { Notification } from '@/features/notifications/api';

const ENTRY = ['/sign-in', '/sign-up', '/forgot-password'];

// Insurer notifications open the portal; anything else belongs to another CatoDrive site.
const portalLink = (n: Notification) => (n.deepLink?.startsWith('/insurers/portal') ? '/portal' : null);

/** The insurance partner portal frame; sign-in pages stand alone, everything else needs an account. */
export function InsuranceChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/';
  const logout = useLogout();

  if (ENTRY.includes(pathname)) {
    return <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-4 py-8 sm:px-6 sm:py-12">{children}</main>;
  }

  return (
    <AuthGuard loginPath={`/sign-in?next=${encodeURIComponent(pathname)}`}>
      <RouteProgress />
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <Logo className="h-9 w-9 shrink-0" />
            <span className="display truncate text-lg tracking-tight sm:text-xl">CatoDrive</span>
            <span className="hidden rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-primary min-[400px]:inline">Insurance partners</span>
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <NotificationBell linkFor={portalLink} />
            <button type="button" onClick={() => logout.mutate()} aria-label="Sign out" className="grid h-10 w-10 place-items-center rounded-full hover:bg-accent">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>
      <main className="w-full flex-1">{children}</main>
    </AuthGuard>
  );
}
