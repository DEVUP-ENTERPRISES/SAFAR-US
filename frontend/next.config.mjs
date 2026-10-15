import { securityHeaders } from './security-headers.mjs';

const PROD = process.env.NODE_ENV === 'production';
const origin = (value, dev, prod) => (value ?? (PROD ? prod : dev)).replace(/\/$/, '');

// Pages that live on the other websites, kept in step with siteForPath() in src/lib/sites.ts.
const SITE_SECTIONS = [
  // The host website (self-serve hosts and their captains) - see host-web/.
  { origin: origin(process.env.NEXT_PUBLIC_HOST_URL, 'http://localhost:3020', 'https://host.catodrive.com'), sections: ['/host', '/captain'] },
  // The partner website (the Asset Partner portal) - see partner-web/.
  {
    origin: origin(process.env.NEXT_PUBLIC_PARTNER_URL, 'http://localhost:3010', 'https://partners.catodrive.com'),
    sections: ['/asset-partners/:section(dashboard|vehicles|statements|maintenance|documents|profile)'],
  },
];

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
    return SITE_SECTIONS.flatMap(({ origin: site, sections }) =>
      sections.flatMap((section) => {
        // The destination keeps the matched section name but drops its pattern.
        const to = `${site}${section.replace(/\(.*\)$/, '')}`;
        return [
          { source: section, destination: to, permanent: false },
          { source: `${section}/:path*`, destination: `${to}/:path*`, permanent: false },
        ];
      }),
    );
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
