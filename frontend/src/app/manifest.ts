import type { MetadataRoute } from 'next';

/**
 * PWA manifest. Next serves this at /manifest.webmanifest and links it
 * automatically. A rich manifest (real name, maskable icons, theme) is what
 * makes the OS install dialog look like a real app instead of a bookmark —
 * which matters when the install prompt is shown across 50+ countries.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'CATO Drive — Premium Car Rentals',
    short_name: 'CATO Drive',
    description:
      'Book premium cars delivered to your terminal, or turn the car you own into income. Curbside at DFW and Love Field.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#12100e',
    theme_color: '#12100e',
    categories: ['travel', 'business', 'lifestyle'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
