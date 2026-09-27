'use client';

import { ReactLenis } from 'lenis/react';
import type { ReactNode } from 'react';

/**
 * Smooth page scrolling.
 *
 * allowNestedScroll: a wheel over any scrollable panel (search popovers, date picker, booking sheet,
 * chat, menus) scrolls that panel; without it the page moved and the panel could not be scrolled.
 * lerp 0.1 keeps it smooth but responsive (0.03 took about 1.75s to settle after one wheel notch).
 */
export function LenisProvider({ children }: { children: ReactNode }) {
  return (
    <ReactLenis root options={{ lerp: 0.1, smoothWheel: true, allowNestedScroll: true }}>
      {children}
    </ReactLenis>
  );
}
