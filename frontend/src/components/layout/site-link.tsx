'use client';

import type { MouseEvent, ReactNode } from 'react';
import { goToSite, siteForPath, siteUrl, type Site } from '@/lib/sites';

// A real <a>; a plain click carries the session across.
export function SiteLink({ site: forced, path, className, children, onNavigate, role }: { site?: Site; path: string; className?: string; children: ReactNode; onNavigate?: () => void; role?: string }) {
  const site = forced ?? siteForPath(path);
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Modified clicks open a new tab the browser's way; only a plain click hands the session over.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onNavigate?.();
    void goToSite(site, path);
  };
  return (
    <a href={siteUrl(site, path)} onClick={onClick} className={className} role={role}>
      {children}
    </a>
  );
}
