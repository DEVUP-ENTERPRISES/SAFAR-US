import { Logo } from '@/components/layout/logo';
import Link from 'next/link';
import { config } from '@/lib/config';

/**
 * Host self-serve and Corporate are commented conditionally in, not deleted —
 * see config.assetPartnersOnly. Investor Relations stays under Business
 * either way; it isn't a self-serve product invitation.
 */
const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Explore',
    links: [
      { label: 'How it works', href: '/about' },
      { label: 'Search cars', href: '/search' },
      { label: 'Compare', href: '/compare' },
      { label: 'Saved cars', href: '/wishlist' },
      { label: 'Rewards', href: '/rewards' },
      { label: 'Refer a friend', href: '/referral' },
    ],
  },
  {
    title: 'Hosting',
    links: [
      { label: 'Asset Partners', href: '/asset-partners' },
      { label: 'Partner dashboard', href: '/asset-partners/dashboard' },
      ...(config.assetPartnersOnly
        ? []
        : [
            { label: 'Become a host', href: '/host' },
            { label: 'List your car', href: '/host/listings/new' },
            { label: 'Host earnings', href: '/host/earnings' },
            { label: 'Fleet management', href: '/host/fleet' },
          ]),
    ],
  },
  {
    title: 'Business',
    links: [
      ...(config.assetPartnersOnly
        ? []
        : [
            { label: 'CatoDrive for Business', href: '/corporate' },
            { label: 'Corporate login', href: '/corporate/login' },
            { label: 'Cost centers', href: '/corporate/cost-centers' },
            { label: 'Invoices', href: '/corporate/invoices' },
          ]),
      { label: 'Investor Relations', href: '/investors' },
    ],
  },
  {
    title: 'Support',
    links: [
      { label: 'Contact us', href: '/contact' },
      { label: 'Help center', href: '/help' },
      { label: 'Contact support', href: '/support' },
      { label: 'Claims', href: '/claims' },
      { label: 'My trips', href: '/bookings' },
      { label: 'Account', href: '/account' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border bg-subtle">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-5">
          {/* Brand block */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2.5">
              <Logo className="h-9 w-9 shrink-0" />
              <span className="display text-xl tracking-tight">{config.appName}</span>
            </div>
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              Book a car from a trusted local host, or turn the car you already own into monthly
              income.
            </p>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold">{col.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-border pt-8 sm:flex-row sm:items-center">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} DEVUP ECOSYSTEM PVT LTD. All rights reserved.
          </p>
          {/*
            These were <span>s — dead text. A marketplace taking card payments
            has to put its terms and privacy policy one click from every page,
            and /legal was reachable only from the mobile nav drawer, so on
            desktop there was no route to them at all.
          */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <Link href="/legal" className="transition-colors hover:text-foreground">
              Terms
            </Link>
            <Link href="/legal" className="transition-colors hover:text-foreground">
              Privacy
            </Link>
            <Link href="/insurance" className="transition-colors hover:text-foreground">
              Trust &amp; Safety
            </Link>
            <span>United States (USD $)</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
