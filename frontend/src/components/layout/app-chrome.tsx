'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Navbar } from './navbar';
import { Footer } from './footer';
import { MobileTabBar } from './mobile-tab-bar';
import { CompareBar } from '@/features/vehicles/components/compare-bar';
import { adminPath } from '@/lib/admin-path';

/**
 * Decides which chrome a route gets.
 *
 * The admin console is a different product from the consumer marketplace: it
 * must not carry the shopper navbar ("Become a host", "Search cars"), the
 * marketing footer, or the compare bar, and it needs the full viewport width
 * for dense tables. So /admin renders bare and supplies its own shell.
 */
export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const isConsole = pathname.startsWith(adminPath());
  const isAuth = pathname === '/login' || pathname === '/register';

  if (isConsole || isAuth) return <>{children}</>;

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-8 pt-24 sm:px-6">{children}</main>
      <Footer />
      <CompareBar />
      <MobileTabBar />
    </>
  );
}
