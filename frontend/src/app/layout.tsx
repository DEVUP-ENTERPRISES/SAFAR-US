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

export const metadata: Metadata = {
  title: {
    default: `${config.appName} — Mobility Operating System`,
    template: `%s · ${config.appName}`,
  },
  description:
    'CATO is a complete mobility platform — peer-to-peer vehicle rentals, fleet, corporate mobility, and more.',
  applicationName: config.appName,
  openGraph: { title: config.appName, type: 'website' },
};

export const viewport: Viewport = {
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
