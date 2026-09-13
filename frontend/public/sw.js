/*
 * CATO Drive service worker — deliberately conservative.
 *
 * The one rule that must never break: money and availability are always live.
 * The API is a different origin (api.axonycs.com), and this worker only ever
 * touches SAME-origin GETs, so API/booking/pricing requests are never cached —
 * they always hit the network. No stale prices, ever.
 *
 * Caching, by request type:
 *   - versioned build assets + images/icons/fonts → cache-first (instant, safe:
 *     the URLs are content-hashed or static)
 *   - page navigations → network-first, falling back to a cached copy (or a
 *     minimal offline page) only when truly offline
 *   - everything else → straight to the network
 */
const VERSION = 'cato-v1';
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;

const OFFLINE_HTML =
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Offline · CATO Drive</title>' +
  '<style>html{background:#12100e;color:#f4f1ea;font-family:system-ui,sans-serif;height:100%}' +
  'body{height:100%;margin:0;display:grid;place-items:center;text-align:center;padding:24px}' +
  '.b{max-width:22rem}h1{font-size:1.4rem;margin:.5rem 0}p{opacity:.7;line-height:1.5}' +
  'button{margin-top:1.25rem;background:#1f8f8a;color:#fff;border:0;border-radius:12px;padding:12px 22px;font-weight:700;font-size:1rem}</style>' +
  '<div class="b"><h1>You’re offline</h1><p>CATO Drive needs a connection to show live cars and prices. ' +
  'Check your network and try again.</p><button onclick="location.reload()">Retry</button></div>';

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/logos/') ||
    url.pathname.startsWith('/sections/') ||
    url.pathname.startsWith('/newsections/') ||
    url.pathname.startsWith('/categories/') ||
    /\.(?:js|css|woff2?|png|jpg|jpeg|webp|avif|svg|ico)$/.test(url.pathname)
  );
}

self.addEventListener('install', (event) => {
  // Take over as soon as it's ready — no waiting for every tab to close.
  self.skipWaiting();
  event.waitUntil(caches.open(PAGE_CACHE));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from older versions so a deploy never serves stale assets.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Only same-origin — the cross-origin API, Mapbox, CDNs go straight to network.
  if (url.origin !== self.location.origin) return;

  // Page navigations: network-first, cache as a fallback for offline revisits.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(PAGE_CACHE);
          cache.put(request, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(request);
          return (
            cached ||
            new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
          );
        }
      })(),
    );
    return;
  }

  // Static, content-stable assets: cache-first, refresh in the background.
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res && res.status === 200) {
              caches.open(STATIC_CACHE).then((c) => c.put(request, res.clone()));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })(),
    );
  }
  // Anything else (same-origin non-asset GETs): default network handling.
});
