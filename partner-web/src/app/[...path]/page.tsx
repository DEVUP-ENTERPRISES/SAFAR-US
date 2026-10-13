'use client';

import { use, useEffect } from 'react';
import { notFound } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { goToSite } from '@/lib/sites';

/** Sections that live on the guest site; shared screens link to them, and partners land there signed in. */
const GUEST_SECTIONS = new Set([
  'account', 'support', 'help', 'claims', 'vehicles', 'hosts', 'bookings', 'trips', 'messages', 'wallet', 'search',
  'wishlist', 'citations', 'saved-searches', 'membership', 'rewards', 'referral', 'contact', 'terms', 'privacy', 'legal',
  'about', 'insurance', 'investors', 'calculator', 'compare', 'verify', 'delete-account', 'asset-partners', 'insurers',
]);

/**
 * Any path the partner site doesn't serve: a guest-site section is carried
 * over to catodrive.com with the session kept; anything else is a real 404.
 */
export default function OtherSite({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = use(params);
  const guest = GUEST_SECTIONS.has(path[0]);
  useEffect(() => {
    if (guest) void goToSite('guest', `/${path.map(encodeURIComponent).join('/')}${window.location.search}`);
  }, [guest, path]);
  if (!guest) notFound();
  return <Skeleton className="mx-auto mt-10 h-32 max-w-md rounded-2xl" />;
}
