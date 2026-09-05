import type { Metadata, Viewport } from 'next';
import { Archivo, Instrument_Sans, IBM_Plex_Mono } from 'next/font/google';
import '@/styles/globals.css';
import { Providers } from '@/app/providers';
import { AdminChrome } from './admin-chrome';

/**
 * Root shell for the standalone admin application (port 3005).
 *
 * Reuses the public app's Providers, design tokens and font pairing from
 * ../frontend/src, so the console is identical without a second copy of any of
 * it — but carries NONE of the public marketplace chrome. AdminChrome supplies
 * the back-office frame (topbar, sidebar, server-verified access gate) and
 * leaves the login route bare.
 */
const fontDisplay = Archivo({
  subsets: ['latin', 'latin-ext'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});
const fontSans = Instrument_Sans({ subsets: ['latin', 'latin-ext'], variable: '--font-sans', display: 'swap' });
const fontMono = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CATO Admin',
  // The console must never be indexed.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f6f2' },
    { media: '(prefers-color-scheme: dark)', color: '#151210' },
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
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>
          <AdminChrome>{children}</AdminChrome>
        </Providers>
      </body>
    </html>
  );
}
