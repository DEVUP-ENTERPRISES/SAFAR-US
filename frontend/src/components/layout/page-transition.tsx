'use client';

import type { ReactNode } from 'react';

/**
 * Content entrance wrapper.
 *
 * This used to be keyed by pathname to replay its animation on every route
 * change. That key destroyed and rebuilt the whole page subtree on every
 * navigation — every component remounted, every effect re-ran and every
 * query refetched, which is why navigating felt like a full page load. The
 * animation now plays on first paint only; navigation reconciles normally.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
