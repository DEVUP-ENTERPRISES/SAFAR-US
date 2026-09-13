'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * A subtle content entrance on every route change — a short fade + rise so
 * sections don't snap in. Keyed by pathname so the animation replays on each
 * navigation. Deliberately quick (0.35s) and only vertical, so it reads as
 * polish, never as a delay.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-page-in">
      {children}
    </div>
  );
}
