'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

// Entrance animation plays once per mount (no pathname key — that was forcing
// a full remount on every nav). Scroll-to-top is forced explicitly since the
// fixed navbar/sticky panels were leaving routes rendering mid-scroll.
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);

  return <div className="animate-page-in">{children}</div>;
}
