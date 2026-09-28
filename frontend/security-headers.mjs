/**
 * Security headers shared by the public site and the admin console.
 *
 * The content security policy is ENFORCED: the browser refuses any script, frame or connection
 * to an origin not listed here, which is what stops injected scripts, card skimmers and data
 * exfiltration. Every origin below is one the app actually uses. Violations are reported to the
 * API and show up in the admin Failed Attempts page, so a missing origin is visible immediately.
 *
 * 'unsafe-inline' is needed for Next.js hydration without nonces; 'unsafe-eval' only because the
 * Google Maps JavaScript API requires it.
 */
export function securityHeaders({ apiUrl, dev = false } = {}) {
  let apiOrigin = '';
  try {
    apiOrigin = new URL(apiUrl ?? '').origin;
  } catch {
    apiOrigin = '';
  }
  const apiWs = apiOrigin ? apiOrigin.replace(/^http/, 'ws') : '';

  const stripe = 'https://js.stripe.com https://*.js.stripe.com https://*.stripe.com https://*.stripe.network';
  const google = 'https://maps.googleapis.com https://maps.gstatic.com https://*.googleapis.com https://*.gstatic.com https://accounts.google.com';
  const apple = 'https://appleid.cdn-apple.com https://appleid.apple.com';
  const mapbox = 'https://api.mapbox.com https://events.mapbox.com';
  const cloudflare = 'https://static.cloudflareinsights.com https://cloudflareinsights.com';

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${stripe} ${google} ${apple} ${mapbox} ${cloudflare}`,
    `connect-src 'self' ${apiOrigin} ${apiWs} ${stripe} ${google} ${apple} ${mapbox} ${cloudflare} https://*.firebaseio.com https://*.firebaseapp.com https://*.amazonaws.com${dev ? ' ws: http://localhost:* http://127.0.0.1:*' : ''}`,
    `frame-src ${stripe} https://accounts.google.com https://appleid.apple.com https://*.firebaseapp.com`,
    // Local development serves photos from the API over plain http (localhost:8080).
    `img-src 'self' data: blob: https:${dev ? ' http://localhost:* http://127.0.0.1:*' : ''}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com ${mapbox}`,
    "font-src 'self' data: https://fonts.gstatic.com",
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    `media-src 'self' blob: https:${dev ? ' http://localhost:* http://127.0.0.1:*' : ''}`,
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://*.stripe.com",
    "frame-ancestors 'none'",
    ...(dev ? [] : ['upgrade-insecure-requests']),
    ...(apiOrigin ? [`report-uri ${apiOrigin}/api/v1/security/csp-report`] : []),
  ].join('; ');

  return [
    { key: 'Content-Security-Policy', value: csp },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
    { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
    { key: 'X-DNS-Prefetch-Control', value: 'off' },
    { key: 'Origin-Agent-Cluster', value: '?1' },
    // Camera is needed by our own condition-photo capture and by Stripe Identity's document/selfie step, which runs in a Stripe iframe.
    {
      key: 'Permissions-Policy',
      value:
        'camera=(self "https://js.stripe.com" "https://verify.stripe.com"), microphone=(self "https://js.stripe.com" "https://verify.stripe.com"), geolocation=(self), payment=(self "https://js.stripe.com"), usb=(), serial=(), bluetooth=(), hid=(), midi=(), magnetometer=(), gyroscope=(), accelerometer=(), display-capture=(), interest-cohort=(), browsing-topics=()',
    },
  ];
}
