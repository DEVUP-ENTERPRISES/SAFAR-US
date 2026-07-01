'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Car, TrendingUp, Layers, Wrench, User } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const TABS = [
  { href: '/host', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/host/listings', label: 'Listings', icon: Car },
  { href: '/host/earnings', label: 'Earnings', icon: TrendingUp },
  { href: '/host/fleet', label: 'Fleet', icon: Layers },
  { href: '/host/operations', label: 'Operations', icon: Wrench },
  { href: '/host/profile', label: 'Profile', icon: User },
];

export function HostNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border pb-px">
      {TABS.map((t) => {
        const active = t.href === '/host' ? pathname === '/host' : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              'flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              active
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
