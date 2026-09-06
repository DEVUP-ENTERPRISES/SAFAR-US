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
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), payment=(), usb=(), interest-cohort=()' },
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
