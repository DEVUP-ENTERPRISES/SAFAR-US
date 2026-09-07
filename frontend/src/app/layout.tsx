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
 * Owned, on-brand metadata for CATO Drive.
 *
 * Every field is filled with the product's own identity rather than left to a
 * framework default, so search engines, link previews and site scanners see
 * "CATO Drive", not a generic scaffold. Nothing here advertises the build tool
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
    'CATO Drive', 'car rental', 'rent a car', 'peer to peer car rental',
    'car sharing', 'book a car', 'local car rental', 'host your car', 'car hire',
  ],
  category: 'travel',
  referrer: 'strict-origin-when-cross-origin',
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  icons: { icon: '/icon.png', shortcut: '/icon.png', apple: '/icon.png' },
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
  // Map the page 1:1 to the device and lock it like an app: no pinch-zoom, no
  // user scaling. The layout is already responsive, so zoom served no purpose
  // here except to let the whole page be dragged/panned around.
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
      <body className="flex min-h-screen flex-col font-sans antialiased overflow-x-hidden">
        <Providers>
          {/* Consumer chrome for the marketplace; the admin console supplies
              its own shell (see AppChrome). */}
          <AppChrome>{children}</AppChrome>
        </Providers>
      </body>
    </html>
  );
}
