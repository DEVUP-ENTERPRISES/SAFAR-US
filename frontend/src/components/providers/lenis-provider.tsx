'use client';

import { ReactLenis } from 'lenis/react';
import { ReactNode } from 'react';

export function LenisProvider({ children }: { children: ReactNode }) {
  return (
    <ReactLenis root options={{ lerp: 0.03, duration: 2.0, smoothWheel: true }}>
      {children}
    </ReactLenis>
  );
}
