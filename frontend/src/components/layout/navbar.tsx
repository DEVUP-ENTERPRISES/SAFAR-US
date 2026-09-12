'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, Menu, X, Car, Info, HelpCircle, FileText, ShieldCheck, Calculator } from 'lucide-react';
import { config } from '@/lib/config';
import { Logo } from '@/components/layout/logo';
import { useAuthStore } from '@/features/auth/store';
import { useIsHost } from '@/features/host/hooks';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';
import { NotificationBell } from './notification-bell';
import { SearchBarFields } from '@/features/search/search-bar-fields';

export function Navbar() {
  const { status } = useAuthStore();
  const pathname = usePathname();
  const authed = status === 'authenticated';
  const isHost = useIsHost();
  const isSearch = pathname === '/search';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Prevent scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenuOpen]);

  return (
    <>
      <header className={cn(
        'fixed top-4 inset-x-4 z-50 mx-auto rounded-2xl border border-white/10 bg-background/60 backdrop-blur-2xl shadow-xl shadow-black/10 transition-all duration-300',
        isSearch ? 'max-w-7xl' : 'max-w-6xl',
      )}>
        <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
        {/* Left: Mobile Menu Toggle & Wordmark */}
        <div className="flex items-center gap-3">
          <button 
            className="sm:hidden p-1 -ms-1 text-foreground transition-transform hover:scale-110" 
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          
          <Link href="/" className="flex shrink-0 items-center gap-2.5 transition-transform hover:scale-105">
            <Logo className="h-9 w-9 shrink-0" />
            <span className="display text-xl tracking-tight hidden xs:block">{config.appName}</span>
          </Link>
        </div>

        {/* On the search page the full Where / From / Until bar lives inline in
            the navbar (desktop) — one integrated top bar, no separate box. */}
        {isSearch && (
          <div className="hidden min-w-0 flex-1 lg:block">
            <SearchBarFields variant="nav" />
          </div>
        )}

        {/* Compact search affordance elsewhere (not home, not the search page). */}
        {pathname !== '/' && !isSearch && (
          <Link
            href="/search"
            className="hidden flex-1 items-center gap-2 rounded-full border border-border/50 bg-background/40 px-4 py-1.5 text-sm text-muted-foreground shadow-sm transition-all hover:bg-background/80 hover:shadow-md md:flex md:max-w-xs"
          >
            <Search className="h-4 w-4 text-primary" />
            <span className="font-medium">Search cars</span>
          </Link>
        )}

        <nav className={cn('flex shrink-0 items-center gap-1 sm:gap-2', isSearch && 'lg:ms-4')}>
          {/* Explore and Host live in the avatar menu on the search page, so the
              inline search bar has room to breathe. */}
          {!isSearch && (
            <>
              <Link
                href="/search"
                className="hidden rounded-full px-4 py-1.5 text-sm font-semibold transition-all hover:bg-primary/10 hover:text-primary sm:block"
              >
                Explore
              </Link>
              <Link
                href="/about"
                className="hidden rounded-full px-4 py-1.5 text-sm font-semibold transition-all hover:bg-primary/10 hover:text-primary sm:block"
              >
                How it works
              </Link>
              <Link
                href="/host"
                className="hidden rounded-full px-4 py-1.5 text-sm font-semibold transition-all hover:bg-primary/10 hover:text-primary sm:block"
              >
                {/* Don't invite an existing host to "become" one. */}
                {isHost ? 'Host dashboard' : 'Become a host'}
              </Link>
            </>
          )}

          <div className="hidden sm:flex items-center justify-center h-8 w-8 rounded-full hover:bg-accent transition-colors ms-1">
            <ThemeToggle />
          </div>

          {authed ? (
            <div className="ms-1 flex items-center gap-1">
              <NotificationBell />
              <UserMenu />
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-2 ms-2">
              <Link href="/login">
                <Button variant="ghost" size="sm" className="rounded-full font-semibold hover:bg-primary/10 hover:text-primary">Log in</Button>
              </Link>
              <Link href="/register">
                <Button size="sm" className="rounded-full px-5 font-semibold shadow-lg shadow-primary/20 transition-transform hover:-translate-y-0.5">Sign up</Button>
              </Link>
            </div>
          )}
        </nav>
      </div>
      </header>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex sm:hidden">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-background/80 backdrop-blur-sm" 
            onClick={() => setMobileMenuOpen(false)}
          />
          
          {/* Drawer */}
          <div className="fixed inset-y-0 start-0 w-[85%] max-w-sm bg-background shadow-2xl animate-slide-in-right flex flex-col">
            <div className="flex items-center justify-between px-4 h-16 border-b border-border">
              <Link href="/" className="flex items-center gap-2.5" onClick={() => setMobileMenuOpen(false)}>
                <Logo className="h-9 w-9 shrink-0" />
                <span className="display text-xl tracking-tight">{config.appName}</span>
              </Link>
              <button 
                className="p-2 -me-2 text-foreground" 
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto py-4">
              {!authed && (
                <div className="px-4 pb-6 space-y-3 border-b border-border mb-4">
                  <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="outline" className="w-full justify-start text-base py-6">Log in</Button>
                  </Link>
                  <Link href="/register" onClick={() => setMobileMenuOpen(false)}>
                    <Button className="w-full justify-start text-base py-6">Sign up</Button>
                  </Link>
                </div>
              )}
              
              <nav className="px-2 space-y-1">
                <Link href="/host" className="flex items-center gap-3 px-4 py-3 text-base font-medium rounded-xl hover:bg-accent" onClick={() => setMobileMenuOpen(false)}>
                  <Car className="h-5 w-5 text-muted-foreground" />
                  {isHost ? 'Host dashboard' : 'Become a host'}
                </Link>
                <Link href="/about" className="flex items-center gap-3 px-4 py-3 text-base font-medium rounded-xl hover:bg-accent" onClick={() => setMobileMenuOpen(false)}>
                  <Info className="h-5 w-5 text-muted-foreground" />
                  Why choose {config.appName}
                </Link>
                <Link href="/support" className="flex items-center gap-3 px-4 py-3 text-base font-medium rounded-xl hover:bg-accent" onClick={() => setMobileMenuOpen(false)}>
                  <HelpCircle className="h-5 w-5 text-muted-foreground" />
                  Get help
                </Link>
                <Link href="/legal" className="flex items-center gap-3 px-4 py-3 text-base font-medium rounded-xl hover:bg-accent" onClick={() => setMobileMenuOpen(false)}>
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  Legal
                </Link>
                <Link href="/insurance" className="flex items-center gap-3 px-4 py-3 text-base font-medium rounded-xl hover:bg-accent" onClick={() => setMobileMenuOpen(false)}>
                  <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                  Insurance & protection
                </Link>
                <Link href="/calculator" className="flex items-center gap-3 px-4 py-3 text-base font-medium rounded-xl hover:bg-accent" onClick={() => setMobileMenuOpen(false)}>
                  <Calculator className="h-5 w-5 text-muted-foreground" />
                  Carculator
                </Link>
              </nav>
            </div>
            <div className="p-4 border-t border-border flex justify-between items-center">
              <span className="text-sm font-medium text-muted-foreground">Appearance</span>
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Minimal road/motion mark — reads as a brand, not a stock car icon. */
