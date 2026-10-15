'use client';

import { useEffect } from 'react';
import { notFound } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { goToSite, siteForPath, type Site } from '@/lib/sites';

/** Sections that live on the guest site; shared screens link to them, and partners land there signed in. */
const GUEST_SECTIONS = new Set([
  'account', 'support', 'help', 'claims', 'vehicles', 'hosts', 'bookings', 'trips', 'messages', 'wallet', 'search',
  'wishlist', 'citations', 'saved-searches', 'membership', 'rewards', 'referral', 'contact', 'terms', 'privacy', 'legal',
  'about', 'insurance', 'investors', 'calculator', 'compare', 'verify', 'delete-account', 'asset-partners', 'corporate',
]);

// A page another site owns opens there signed in; anything else is a real 404.
export function OtherSitePage({ site, path }: { site: Site; path: string[] }) {
  const full = `/${path.map(encodeURIComponent).join('/')}`;
  const owner = siteForPath(full);
  // Host and partner pages are known exactly; a guest page only when it is one of the guest site's sections, so unknown paths stay a 404 here.
  const target: Site | null = owner !== 'guest' ? (owner !== site ? owner : null) : site !== 'guest' && GUEST_SECTIONS.has(path[0]) ? 'guest' : null;
  useEffect(() => {
    if (target) void goToSite(target, `${full}${window.location.search}`);
  }, [target, full]);
  if (!target) notFound();
  return <Skeleton className="mx-auto mt-10 h-32 max-w-md rounded-2xl" />;
}
