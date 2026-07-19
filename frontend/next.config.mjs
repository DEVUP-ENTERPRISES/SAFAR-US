/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emits a self-contained server bundle carrying only the node_modules that
  // are actually used — the difference between a ~1GB and a ~150MB image.
  output: 'standalone',
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
