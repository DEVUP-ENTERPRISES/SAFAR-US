import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';
import '@/styles/globals.css';
import { config } from '@/lib/config';
import { Providers } from './providers';
import { AppChrome } from '@/components/layout/app-chrome';

const fontSans = Outfit({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

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
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={fontSans.variable}>
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
