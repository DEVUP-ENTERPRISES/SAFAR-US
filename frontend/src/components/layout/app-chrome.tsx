'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Navbar } from './navbar';
import { Footer } from './footer';
import { MobileTabBar } from './mobile-tab-bar';
import { CompareBar } from '@/features/vehicles/components/compare-bar';
import { RegisterServiceWorker } from '@/features/pwa/register-sw';
import { InstallPrompt } from '@/features/pwa/install-prompt';
import { IntroSplash } from '@/features/pwa/intro-splash';
import { RouteProgress } from './route-progress';
import { PageTransition } from './page-transition';

/**
 * The guest site's chrome.
 *
 * The auth screens render bare - no marketplace chrome around a sign-in form.
 * The admin console (admin-web) and the partner dashboards (partner-web:
 * host, captain, asset partner, corporate) are separate applications with
 * their own frames, so every page here is a guest page.
 */
export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const isAuth = pathname === '/login' || pathname === '/register' || pathname === '/forgot-password' || pathname === '/handoff';

  if (isAuth) return <>{children}</>;

  return (
    <>
      <RouteProgress />
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-8 pt-24 sm:px-6">
        <PageTransition>{children}</PageTransition>
      </main>
      <Footer />
      <CompareBar />
      <MobileTabBar />
      <RegisterServiceWorker />
      <InstallPrompt />
      <IntroSplash />
    </>
  );
}
