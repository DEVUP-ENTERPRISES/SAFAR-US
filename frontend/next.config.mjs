// Report-only for now (launch day): violations are logged in the browser, nothing is blocked. Tighten and enforce once the reports are clean.
const apiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? '').origin;
  } catch {
    return '';
  }
})();
const cspReportOnly = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://maps.googleapis.com https://www.gstatic.com https://www.googleapis.com https://apis.google.com`,
  `connect-src 'self' ${apiOrigin} https://api.stripe.com https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com wss:`,
  'frame-src https://js.stripe.com https://hooks.stripe.com https://verify.stripe.com https://*.firebaseapp.com https://accounts.google.com',
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "frame-ancestors 'none'",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't send the X-Powered-By: Next.js header — no need to announce the stack.
  poweredByHeader: false,
  // Emits a self-contained server bundle carrying only the node_modules that
  // are actually used — the difference between a ~1GB and a ~150MB image.
  output: 'standalone',
  /*
   * Security headers on every response.
   *
   * The app set none, which left it open to clickjacking: any site could frame
   * it and trick a signed-in user into clicking through an invisible overlay
   * (an approve, a payment, a "delete my account"). frame-ancestors 'none' — and
   * the legacy X-Frame-Options for older browsers — forbid framing outright.
   * The rest are cheap, standard hardening: stop MIME sniffing, keep the
   * referrer from leaking full URLs cross-origin, and deny the powerful
   * device APIs this marketplace never uses.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'Content-Security-Policy-Report-Only', value: cspReportOnly },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Camera is needed by our own condition-photo capture and by Stripe Identity's document/selfie step, which runs in a Stripe iframe; blocking it there breaks live verification.
          { key: 'Permissions-Policy', value: 'camera=(self "https://js.stripe.com" "https://verify.stripe.com"), microphone=(self "https://js.stripe.com" "https://verify.stripe.com"), geolocation=(self), payment=(self "https://js.stripe.com"), usb=(), interest-cohort=()' },
          // HSTS: once on HTTPS, never silently downgrade to HTTP. Safe because
          // production is TLS-only behind Cloudflare/Nginx.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.amazonaws.com' }, // S3 direct
      { protocol: 'https', hostname: '**.cloudfront.net' }, // CDN in front of S3
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'picsum.photos' }, // mock storage in dev
    ],
  },
};

export default nextConfig;
