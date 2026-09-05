import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const sharedSrc = path.resolve(dir, '../frontend/src');

/**
 * The admin app is a SEPARATE Next application on its own port (3005), but it
 * shares one component library, API client and admin feature code with the
 * public app rather than duplicating them. `@/*` therefore resolves into
 * ../frontend/src, and `externalDir` lets Next compile TS/TSX that lives
 * outside this app's own root.
 *
 * The public app is untouched by any of this — the sharing is one-directional
 * (admin reads shared code; shared code never imports admin).
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  experimental: { externalDir: true },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: '**.cloudfront.net' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'picsum.photos' },
    ],
  },
  // Belt-and-braces against indexing: the meta robots tag lives in the page
  // head, and this sends the same instruction as an HTTP header, which some
  // crawlers honour even when they do not parse the HTML.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ];
  },
  webpack(config) {
    config.resolve.alias['@'] = sharedSrc;
    return config;
  },
};

export default nextConfig;
