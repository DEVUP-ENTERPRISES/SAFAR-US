'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { trackPageview } from '@/features/analytics/track';

// Entrance animation plays once per mount (no pathname key — that was forcing
// a full remount on every nav). Scroll-to-top is forced explicitly since the
// fixed navbar/sticky panels were leaving routes rendering mid-scroll. Every
// route funnels through here, so it's also the one place a pageview beacon
// covers the whole site without adding a hook to every page.
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const mounted = useRef(false);

  useEffect(() => {
    trackPageview(pathname);
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);

  return <div className="animate-page-in">{children}</div>;
}
