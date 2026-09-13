'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker — production only, so the dev server's hot reload
 * is never served from a cache. Mounted once in the consumer app chrome (not the
 * admin console). Failure is silent: the SW is an enhancement, never a
 * dependency of the app working.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const register = () => navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    // Register after load so it never competes with first paint / hydration.
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);
  return null;
}
