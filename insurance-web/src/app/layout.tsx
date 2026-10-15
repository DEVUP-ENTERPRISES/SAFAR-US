import type { Metadata, Viewport } from 'next';
import { Archivo, Instrument_Sans, IBM_Plex_Mono } from 'next/font/google';
import '@/styles/globals.css';
import { Providers } from '@/app/providers';
import { DeskChrome } from './desk-chrome';

const fontDisplay = Archivo({ subsets: ['latin', 'latin-ext'], weight: ['600', '700', '800'], variable: '--font-display', display: 'swap' });
const fontSans = Instrument_Sans({ subsets: ['latin', 'latin-ext'], variable: '--font-sans', display: 'swap' });
const fontMono = IBM_Plex_Mono({ subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Insurance desk', template: '%s · Insurance desk' },
  applicationName: 'CatoDrive Insurance desk',
  robots: { index: false, follow: false },
  icons: { apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f6f2' },
    { media: '(prefers-color-scheme: dark)', color: '#151210' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning className={`${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable}`}>
      <body className="flex min-h-screen flex-col overflow-x-clip font-sans antialiased">
        <Providers>
          <DeskChrome>{children}</DeskChrome>
        </Providers>
      </body>
    </html>
  );
}
