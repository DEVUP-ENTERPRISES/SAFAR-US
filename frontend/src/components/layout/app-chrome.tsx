'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Navbar } from './navbar';
import { Footer } from './footer';
import { MobileTabBar } from './mobile-tab-bar';
import { CompareBar } from '@/features/vehicles/components/compare-bar';

/**
 * Decides which chrome a route gets.
 *
 * The auth screens render bare — no marketplace chrome around a sign-in form.
 * The admin console is no longer one of these cases: it moved to its own
 * application (admin-web, port 3005) and this app serves none of it.
 */
export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const isAuth = pathname === '/login' || pathname === '/register';

  if (isAuth) return <>{children}</>;

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
