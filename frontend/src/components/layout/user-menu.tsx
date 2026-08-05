'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Car, LogOut, Wallet, Gift, User, LifeBuoy, Shield, Building2, Heart, ChevronDown, Search, BookOpen, MessageSquare } from 'lucide-react';
import { useAuthStore } from '@/features/auth/store';
import { useUnreadMessages } from '@/features/messaging/hooks';
import { useLogout } from '@/features/auth/hooks';
import { cn } from '@/lib/utils/cn';
import { adminPath } from '@/lib/admin-path';

const ADMIN_ROLES = ['support', 'moderator', 'finance', 'ops', 'super_admin'];

/**
 * Avatar dropdown. Collapses what used to be nine flat nav buttons into a
 * single grouped menu — the pattern every consumer marketplace uses.
 */
export function UserMenu() {
  const { user } = useAuthStore();
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const name = user?.email?.split('@')[0] ?? 'Account';
  const initial = name.slice(0, 1).toUpperCase();
  const isStaff = user?.roles.some((r) => ADMIN_ROLES.includes(r));
  const unread = useUnreadMessages(!!user).data?.count ?? 0;

  const items = [
    { href: '/bookings', label: 'My trips', icon: Car },
    { href: '/messages', label: 'Messages', icon: MessageSquare },
    { href: '/wishlist', label: 'Saved cars', icon: Heart },
    { href: '/saved-searches', label: 'Saved searches', icon: Search },
    { href: '/wallet', label: 'Wallet', icon: Wallet },
    { href: '/rewards', label: 'Rewards', icon: Gift },
    { href: '/account', label: 'Account', icon: User },
    { href: '/help', label: 'Help centre', icon: BookOpen },
    { href: '/support', label: 'Support', icon: LifeBuoy },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unread > 0 ? `Account — ${unread} unread messages` : 'Account'}
        className={cn(
          'relative flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-2.5',
          'shadow-soft transition-all hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <span className="relative grid h-7 w-7 place-items-center rounded-full brand-gradient text-xs font-bold text-white">
          {initial}
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" />
          )}
        </span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 origin-top-right animate-scale-in overflow-hidden rounded-xl border border-border bg-card shadow-float"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>

          <div className="py-1">
            {items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setOpen(false)}
                role="menuitem"
                className="flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-accent"
              >
                <it.icon className="h-4 w-4 text-muted-foreground" /> {it.label}
                {it.href === '/messages' && unread > 0 && (
                  <span className="ml-auto grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </Link>
            ))}
          </div>

          <div className="border-t border-border py-1">
            <Link
              href="/host"
              onClick={() => setOpen(false)}
              role="menuitem"
              className="flex items-center gap-3 px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              <Car className="h-4 w-4 text-primary" /> Host dashboard
            </Link>
            <Link
              href="/corporate"
              onClick={() => setOpen(false)}
              role="menuitem"
              className="flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-accent"
            >
              <Building2 className="h-4 w-4 text-muted-foreground" /> Corporate
            </Link>
            {isStaff && (
              <Link
                href={adminPath()}
                onClick={() => setOpen(false)}
                role="menuitem"
                className="flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-accent"
              >
                <Shield className="h-4 w-4 text-muted-foreground" /> Admin
              </Link>
            )}
          </div>

          <div className="border-t border-border py-1">
            <button
              role="menuitem"
              onClick={() => logout.mutate()}
              className="flex w-full items-center gap-3 px-4 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
