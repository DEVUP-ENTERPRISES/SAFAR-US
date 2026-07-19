import { GOOGLE_MAPS_KEY } from './api';

/**
 * Loads the Google Maps JS API once per page.
 *
 * Deliberately no npm dependency: the API must be fetched from Google's CDN at
 * runtime anyway, so a wrapper package would only add weight and a version to
 * keep in sync. Concurrent callers share one promise, so N map components never
 * inject N script tags (which Google warns about and which breaks the API).
 */
let promise: Promise<void> | null = null;

export function loadGoogleMaps(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (!GOOGLE_MAPS_KEY) return Promise.reject(new Error('No Google Maps key configured'));
  // Already available (e.g. a second map mounting after the first).
  if ((window as unknown as { google?: { maps?: unknown } }).google?.maps) return Promise.resolve();
  if (promise) return promise;

  promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=marker&loading=async&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      promise = null; // let a later mount retry rather than fail forever
      reject(new Error('Google Maps failed to load'));
    };
    document.head.appendChild(script);
  });
  return promise;
}
