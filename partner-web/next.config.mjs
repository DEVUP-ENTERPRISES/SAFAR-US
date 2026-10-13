import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { securityHeaders } from '../frontend/security-headers.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const sharedSrc = path.resolve(dir, '../frontend/src');

/**
 * The partner website (hosts, captains, asset partners, corporate admins) is a
 * separate Next application from the guest site, on its own domain and port
 * (3010). Each site ships only its own pages, builds and deploys on its own,
 * and scales on its own. Components, API client and feature logic are shared,
 * not copied: `@/*` resolves into ../frontend/src, exactly as admin-web does.
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  // Lets shared code know it is running on the partner site.
  env: { NEXT_PUBLIC_APP_SURFACE: 'partner' },
  experimental: { externalDir: true },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: '**.cloudfront.net' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'picsum.photos' },
    ],
  },
  // Signed-in dashboards only: nothing here belongs in a search index.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          ...securityHeaders({ apiUrl: process.env.NEXT_PUBLIC_API_URL, dev: process.env.NODE_ENV !== 'production' }),
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
  webpack(config) {
    config.resolve.alias['@'] = sharedSrc;
    // Shared files live in ../frontend/src, so bare imports must resolve here too.
    config.resolve.modules = [path.resolve(dir, 'node_modules'), 'node_modules'];
    // One instance of every stateful library, whichever source tree imports it (see admin-web/next.config.mjs).
    const nm = path.resolve(dir, 'node_modules');
    for (const pkg of ['@tanstack/react-query', 'next-themes', 'zustand', 'react-hook-form']) {
      config.resolve.alias[pkg] = path.join(nm, pkg);
    }
    return config;
  },
};

export default nextConfig;
