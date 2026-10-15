import type { MetadataRoute } from 'next';
import { config } from '@/lib/config';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.catodrive.com';

const PAGES = ['', '/search', '/about', '/asset-partners', '/asset-partners/apply', '/insurance', '/membership', '/calculator', '/help', '/contact', '/investors', '/terms', '/privacy', '/legal'];

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = PAGES.map((p) => ({ url: `${SITE_URL}${p}`, changeFrequency: 'weekly', priority: p === '' ? 1 : 0.6 }));
  // Live cars are added when the API answers; the static pages are listed either way.
  try {
    const res = await fetch(`${config.apiUrl}/search/vehicles?lat=32.7767&lng=-96.797&radiusKm=200&limit=50`, { next: { revalidate } });
    const body = (await res.json()) as { data?: { _id: string; updatedAt?: string }[] };
    const cars = (body.data ?? []).map((v) => ({ url: `${SITE_URL}/vehicles/${v._id}`, lastModified: v.updatedAt, changeFrequency: 'daily' as const, priority: 0.8 }));
    return [...pages, ...cars];
  } catch {
    return pages;
  }
}
