'use client';

import type { MouseEvent, ReactNode } from 'react';
import { goToSite, siteUrl, type Site } from '@/lib/sites';

/**
 * A link to a page on CatoDrive's other website. A real <a> (new tab, copy
 * link, crawlers all work); a plain click carries the session across so a
 * signed-in person stays signed in.
 */
export function SiteLink({ site, path, className, children, onNavigate, role }: { site: Site; path: string; className?: string; children: ReactNode; onNavigate?: () => void; role?: string }) {
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
