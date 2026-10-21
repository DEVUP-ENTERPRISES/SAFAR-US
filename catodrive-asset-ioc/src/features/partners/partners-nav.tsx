'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

const TABS = [
  { href: '/ops/partners', label: 'Applications' },
  { href: '/ops/partners/members', label: 'Partners' },
  { href: '/ops/partners/payouts', label: 'Payouts' },
  { href: '/ops/partners/agreement', label: 'Agreement' },
];

export function PartnersNav() {
  const pathname = usePathname() ?? '';
  const active = (href: string) => (href === '/ops/partners' ? pathname === href || pathname.startsWith('/ops/partners/applications') : pathname.startsWith(href));
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-full border border-border p-1" aria-label="Asset Partners">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={cn('shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors', active(t.href) ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
