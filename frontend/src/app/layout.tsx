import type { Metadata, Viewport } from 'next';
import { Archivo, Instrument_Sans, IBM_Plex_Mono } from 'next/font/google';
import '@/styles/globals.css';
import { config } from '@/lib/config';
import { Providers } from './providers';
import { AppChrome } from '@/components/layout/app-chrome';

/*
 * Three voices, not one.
 *
 * Outfit previously did display AND body, so nothing on any screen carried
 * emphasis — everything spoke in the same tone. Archivo takes weight and
 * tightens toward signage at large sizes; Instrument Sans stays quiet
 * underneath it; and numbers move to a mono face because prices, totals,
 * plates and citation references are data and must line up in a column.
 *
 * All three carry extended Latin, Cyrillic and Greek. CJK, Arabic and
 * Devanagari fall through to the system stack until we add a companion face.
 */
const fontDisplay = Archivo({
  subsets: ['latin', 'latin-ext'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});
const fontSans = Instrument_Sans({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-sans',
  display: 'swap',
});
const fontMono = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

/*
 * Owned, on-brand metadata for CatoDrive.
 *
 * Every field is filled with the product's own identity rather than left to a
 * framework default, so search engines, link previews and site scanners see
 * "CatoDrive", not a generic scaffold. Nothing here advertises the build tool
 * (and poweredByHeader is off in next.config, so no X-Powered-By header ships).
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://catodrive.com';
const BRAND = `${config.appName} Drive`;
const TAGLINE = `${BRAND} — rent the perfect car from local hosts`;
const DESCRIPTION =
  `${BRAND} is a peer-to-peer car rental marketplace: book a car from a trusted local host, ` +
  `or earn by sharing yours. Verified hosts, protected trips, no rental counters.`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TAGLINE,
    template: `%s · ${BRAND}`,
  },
  description: DESCRIPTION,
  applicationName: BRAND,
  authors: [{ name: BRAND, url: SITE_URL }],
  creator: BRAND,
  publisher: BRAND,
  // Don't announce the generator/build tool.
  generator: null,
  keywords: [
    'CatoDrive', 'car rental', 'rent a car', 'peer to peer car rental',
    'car sharing', 'book a car', 'local car rental', 'host your car', 'car hire',
  ],
  category: 'travel',
  referrer: 'strict-origin-when-cross-origin',
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  icons: { icon: '/icon.png', shortcut: '/icon.png', apple: '/icons/apple-touch-icon.png' },
  manifest: '/manifest.webmanifest',
  // Makes iOS treat an added-to-home-screen CatoDrive like a standalone app.
  appleWebApp: { capable: true, title: 'CatoDrive', statusBarStyle: 'default' },
  openGraph: {
    type: 'website',
    siteName: BRAND,
    title: TAGLINE,
    description: DESCRIPTION,
    url: SITE_URL,
    images: [{ url: '/logos/cato-logo.png', width: 829, height: 937, alt: BRAND }],
  },
  twitter: {
    card: 'summary',
    title: TAGLINE,
    description: DESCRIPTION,
    images: ['/logos/cato-logo.png'],
  },
};

export const viewport: Viewport = {
  /*
   * Pinch-zoom stays available.
   *
   * This previously set maximumScale:1 / userScalable:false to make the page
   * feel app-like. That is a WCAG 1.4.4 failure: someone who needs to magnify
   * a licence plate, a price breakdown or a pickup address simply could not.
   * The horizontal-pan problem it was really solving is handled properly by
   * overflow-x on the document, not by taking zoom away from everyone.
   */
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f6f2' }, // --background paper
    { media: '(prefers-color-scheme: dark)', color: '#151210' }, // --background asphalt
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      dir="ltr"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable}`}
    >
      {/*
        overflow-x must be `clip`, never `hidden`.

        Setting overflow-x:hidden forces the computed overflow-y to `auto`, which
        makes <body> a scroll container — and `position: sticky` resolves against
        its nearest scrolling ancestor. Every sticky element in the app was
        therefore sticking to the body box rather than the viewport, which is why
        the booking panel on a vehicle page scrolled away instead of staying put.

        `clip` does the same horizontal clipping (the reason this is here at all)
        without creating a scroll container, so sticky keeps working.
      */}
      <body className="flex min-h-screen flex-col font-sans antialiased overflow-x-clip">
        <Providers>
          {/* Consumer chrome for the marketplace; the admin console supplies
              its own shell (see AppChrome). */}
          <AppChrome>{children}</AppChrome>
        </Providers>
      </body>
    </html>
  );
}
