'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { AuthGuard } from '@/components/layout/auth-guard';
import { RouteProgress } from '@/components/layout/route-progress';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/features/auth/store';
import { useLogout } from '@/features/auth/hooks';
import { INSURANCE_DESK_ROLES } from '@/features/auth/session';
import { cn } from '@/lib/utils/cn';

const NAV = [
  { href: '/insurers', label: 'Insurers' },
  { href: '/fleet', label: 'Fleet insurance' },
];

function DeskFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/';
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const logout = useLogout();
  const allowed = roles.some((r) => INSURANCE_DESK_ROLES.includes(r));

  return (
    <>
      <RouteProgress />
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/insurers" className="flex items-center gap-2.5">
              <Logo className="h-8 w-8" />
              <span className="font-semibold">Insurance desk</span>
            </Link>
            {allowed && (
              <nav className="flex items-center gap-1" aria-label="Insurance desk">
                {NAV.map((n) => {
                  const on = pathname === n.href || pathname.startsWith(`${n.href}/`);
                  return (
                    <Link key={n.href} href={n.href} className={cn('rounded-md px-3 py-1.5 text-sm font-medium', on ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}>
                      {n.label}
                    </Link>
                  );
                })}
              </nav>
            )}
          </div>
          <button type="button" onClick={() => logout.mutate()} aria-label="Sign out" className="grid h-9 w-9 place-items-center rounded-full hover:bg-accent">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {allowed ? (
          children
        ) : (
          <div className="mx-auto max-w-md space-y-4 py-16 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="font-semibold">This account can’t use the insurance desk.</p>
            <p className="text-sm text-muted-foreground">Ask an admin to give you the insurance role, then sign in again.</p>
            <Button variant="outline" onClick={() => logout.mutate()}>Sign out</Button>
          </div>
        )}
      </main>
    </>
  );
}

export function DeskChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/';
  if (pathname === '/login') return <main className="flex flex-1 items-center justify-center px-4 py-10">{children}</main>;
  return (
    <AuthGuard>
      <DeskFrame>{children}</DeskFrame>
    </AuthGuard>
  );
}
