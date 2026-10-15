import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { securityHeaders } from '../frontend/security-headers.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const sharedSrc = path.resolve(dir, '../frontend/src');

// Every page lives under a secret path, like the admin console; a production build without it refuses to run.
const slug = (process.env.CATODRIVE_ASSET_IOC_SLUG ?? '').replace(/^\/+|\/+$/g, '');
if (process.env.NODE_ENV === 'production' && !slug) throw new Error('CATODRIVE_ASSET_IOC_SLUG must be set: the operations panel never runs on an open path');
const basePath = slug ? `/${slug}` : '';

// Shared code comes from ../frontend/src via `@/*`, as in admin-web and partner-web.
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  ...(basePath ? { basePath } : {}),
  // Lets shared code know it is running on the CatoDrive operations panel, and where its files are served from.
  env: { NEXT_PUBLIC_APP_SURFACE: 'ioc', NEXT_PUBLIC_BASE_PATH: basePath },
  experimental: { externalDir: true },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: '**.cloudfront.net' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'picsum.photos' },
    ],
  },
  // Shared sign-in paths land on this panel's own sign-in; old host links land on the same page here.
  async redirects() {
    return [
      ...['/login', '/register', '/host/login'].map((source) => ({ source, destination: '/sign-in', permanent: false })),
      { source: '/host', destination: '/ops', permanent: false },
      { source: '/host/:path*', destination: '/ops/:path*', permanent: false },
    ];
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
    // This panel's own code, copied from the host dashboard and kept separate from it.
    config.resolve.alias['~'] = path.resolve(dir, 'src');
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
