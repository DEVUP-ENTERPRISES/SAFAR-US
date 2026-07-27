import { MAPBOX_TOKEN } from './api';

/**
 * Loads Mapbox GL JS once per page, from Mapbox's CDN — same no-dependency
 * pattern as the Google loader, and for the same reason: the library has to be
 * fetched at runtime anyway, and concurrent map mounts must share one script
 * tag and one stylesheet rather than injecting N of each.
 */
const VERSION = 'v3.9.3';
let promise: Promise<void> | null = null;

export function loadMapbox(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (!MAPBOX_TOKEN) return Promise.reject(new Error('No Mapbox token configured'));
  if ((window as unknown as { mapboxgl?: unknown }).mapboxgl) return Promise.resolve();
  if (promise) return promise;

  promise = new Promise<void>((resolve, reject) => {
    // Stylesheet (idempotent).
    if (!document.getElementById('mapbox-gl-css')) {
      const link = document.createElement('link');
      link.id = 'mapbox-gl-css';
      link.rel = 'stylesheet';
      link.href = `https://api.mapbox.com/mapbox-gl-js/${VERSION}/mapbox-gl.css`;
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = `https://api.mapbox.com/mapbox-gl-js/${VERSION}/mapbox-gl.js`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      promise = null; // let a later mount retry
      reject(new Error('Mapbox GL failed to load'));
    };
    document.head.appendChild(script);
  });
  return promise;
}
