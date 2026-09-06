'use client';

import { Logo } from '@/components/layout/logo';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, ExternalLink, User } from 'lucide-react';
import { config } from '@/lib/config';
import { useAuthStore } from '@/features/auth/store';
import { useLogout } from '@/features/auth/hooks';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { NotificationBell } from '@/components/layout/notification-bell';
import { adminPath } from '@/lib/admin-path';

/**
 * The console's own top bar. Deliberately not the consumer navbar: an operator
 * needs to know which environment they're touching and who they're acting as,
 * not to be sold a car.
 */
export function AdminTopbar() {
  const router = useRouter();
  const { user } = useAuthStore();
  const logout = useLogout();
  const isProd = process.env.NODE_ENV === 'production';

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
      <div className="flex h-14 items-center gap-4 px-4 sm:px-6">
        <Link href={adminPath()} className="flex shrink-0 items-center gap-2.5">
          <Logo className="h-8 w-8 shrink-0" />
          <span className="text-[15px] font-black tracking-tight">
            {config.appName} <span className="font-medium text-muted-foreground">Console</span>
          </span>
        </Link>

        {/* Environment badge — the cheapest way to stop someone running a
            destructive action against the wrong environment. */}
        <span
          className={`hidden rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider sm:inline ${
            isProd ? 'bg-destructive/15 text-destructive' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
          }`}
        >
          {isProd ? 'production' : 'development'}
        </span>

        <div className="ms-auto flex items-center gap-1.5">
          <Link
            href="/"
            target="_blank"
            className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:flex"
          >
            View site <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          <ThemeToggle />
          <NotificationBell />

          <div className="ms-1 flex items-center gap-2 border-s border-border ps-3">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground">
              <User className="h-4 w-4" />
            </span>
            <div className="hidden min-w-0 leading-tight sm:block">
              <p className="truncate text-xs font-semibold">{user?.email?.split('@')[0] ?? 'Staff'}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {user?.roles?.filter((r) => r !== 'guest').join(', ') || 'staff'}
              </p>
            </div>
            <button
              onClick={() => logout.mutate(undefined, { onSuccess: () => router.push(adminPath('login')) })}
              aria-label="Sign out"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
