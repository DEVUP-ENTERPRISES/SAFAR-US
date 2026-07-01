'use client';

import Link from 'next/link';
import { Car, LogOut, Heart } from 'lucide-react';
import { config } from '@/lib/config';
import { useAuthStore } from '@/features/auth/store';
import { useLogout } from '@/features/auth/hooks';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from './theme-toggle';

export function Navbar() {
  const { user, status } = useAuthStore();
  const logout = useLogout();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Car className="h-5 w-5" />
          </span>
          <span className="text-lg tracking-tight">{config.appName}</span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          <Link href="/search">
            <Button variant="ghost" size="sm">Explore</Button>
          </Link>

          {status === 'authenticated' ? (
            <>
              <Link href="/wishlist">
                <Button variant="ghost" size="icon" aria-label="Saved cars">
                  <Heart className="h-5 w-5" />
                </Button>
              </Link>
              <Link href="/bookings">
                <Button variant="ghost" size="sm">Trips</Button>
              </Link>
              <Link href="/host">
                <Button variant="ghost" size="sm">Host</Button>
              </Link>
              <ThemeToggle />
              <Button variant="outline" size="sm" loading={logout.isPending} onClick={() => logout.mutate()}>
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">{user?.email?.split('@')[0] ?? 'Sign out'}</span>
              </Button>
            </>
          ) : (
            <>
              <ThemeToggle />
              <Link href="/login">
                <Button variant="ghost" size="sm">Log in</Button>
              </Link>
              <Link href="/register">
                <Button size="sm">Sign up</Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
