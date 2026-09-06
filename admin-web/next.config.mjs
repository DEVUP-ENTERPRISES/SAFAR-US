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
  // Don't send the X-Powered-By: Next.js header — no need to announce the stack.
  poweredByHeader: false,
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

    /*
     * Dedupe the stateful singletons.
     *
     * This app imports shared code from ../frontend/src, which has its own
     * node_modules. Without help, a library imported by a shared file resolves
     * to frontend/node_modules while the same library imported by a file here
     * resolves to admin-web/node_modules — two copies, two module instances.
     * For anything that carries React context or module-level state that is
     * fatal: the QueryClientProvider in the shared Providers lives in one copy
     * of react-query and the useQuery in a page lives in the other, so the hook
     * reports "no QueryClient set". The same split would silently break the
     * theme context and the Zustand auth store.
     *
     * react and react-dom are deliberately NOT listed — Next dedupes those
     * itself, and aliasing them to a directory bypasses their package exports
     * and breaks react-dom/server during prerender.
     *
     * Pinning each of these to THIS app's single copy makes every import — from
     * either source tree — land on one instance. Versions match (the two
     * package.json files are kept in sync), so there is no risk in collapsing
     * them.
     */
    const nm = path.resolve(dir, 'node_modules');
    for (const pkg of [
      '@tanstack/react-query',
      'next-themes',
      'zustand',
      'react-hook-form',
    ]) {
      config.resolve.alias[pkg] = path.join(nm, pkg);
    }

    return config;
  },
};

export default nextConfig;
