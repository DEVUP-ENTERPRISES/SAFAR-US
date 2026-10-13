import { securityHeaders } from './security-headers.mjs';

// The partner website (hosts, captains, asset partners, corporate) - see partner-web/.
const PARTNER_SITE = (
  process.env.NEXT_PUBLIC_PARTNER_URL ?? (process.env.NODE_ENV === 'production' ? 'https://partners.catodrive.com' : 'http://localhost:3010')
).replace(/\/$/, '');
const PARTNER_SECTIONS = ['/host', '/corporate', '/captain', '/asset-partners/:section(dashboard|vehicles|statements|maintenance|documents|profile)'];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't send the X-Powered-By: Next.js header - no need to announce the stack.
  poweredByHeader: false,
  // Emits a self-contained server bundle carrying only the node_modules that
  // are actually used - the difference between a ~1GB and a ~150MB image.
  output: 'standalone',
  /*
   * Security headers on every response.
   *
   * The app set none, which left it open to clickjacking: any site could frame
   * it and trick a signed-in user into clicking through an invisible overlay
   * (an approve, a payment, a "delete my account"). frame-ancestors 'none' - and
   * the legacy X-Frame-Options for older browsers - forbid framing outright.
   * The rest are cheap, standard hardening: stop MIME sniffing, keep the
   * referrer from leaking full URLs cross-origin, and deny the powerful
   * device APIs this marketplace never uses.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders({ apiUrl: process.env.NEXT_PUBLIC_API_URL, dev: process.env.NODE_ENV !== 'production' }),
      },
    ];
  },
  /*
   * Partner pages moved to their own website. Old links - emails, bookmarks,
   * push notifications already delivered - still arrive here, so each one is
   * forwarded to the same page on the partner site. Temporary (307), so the
   * mapping can change without browsers caching it forever.
   */
  async redirects() {
    return PARTNER_SECTIONS.flatMap((section) => {
      // The destination keeps the matched section name but drops its pattern.
      const to = `${PARTNER_SITE}${section.replace(/\(.*\)$/, '')}`;
      return [
        { source: section, destination: to, permanent: false },
        { source: `${section}/:path*`, destination: `${to}/:path*`, permanent: false },
      ];
    });
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
