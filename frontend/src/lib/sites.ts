import { api } from '@/lib/api/client';
import { tokenStore } from '@/lib/api/token-store';

const DEV = process.env.NODE_ENV !== 'production';

/** The guest website (catodrive.com). */
export const GUEST_SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? (DEV ? 'http://localhost:3000' : 'https://www.catodrive.com')).replace(/\/$/, '');

/** The partner website: hosts, captains, asset partners and corporate admins. */
export const PARTNER_SITE = (process.env.NEXT_PUBLIC_PARTNER_URL ?? (DEV ? 'http://localhost:3010' : 'https://partners.catodrive.com')).replace(/\/$/, '');

export type Site = 'guest' | 'partner';

const originOf = (site: Site) => (site === 'partner' ? PARTNER_SITE : GUEST_SITE);

/** A path on the other site; relative paths only, so it can never be pointed elsewhere. */
export const siteUrl = (site: Site, path = '/') => `${originOf(site)}${path.startsWith('/') ? path : `/${path}`}`;

/**
 * Go to a page on CatoDrive's other website, staying signed in.
 *
 * The two sites are separate origins with separate sessions, so a signed-in
 * person carries a one-time code (valid a minute, usable once) in the URL
 * fragment, which never reaches a server log; the other site redeems it for
 * its own session. Signed out, it simply navigates.
 */
export async function goToSite(site: Site, path = '/'): Promise<void> {
  const target = siteUrl(site, path);
  if (!tokenStore.getAccess()) {
    window.location.assign(target);
    return;
  }
  try {
    const { code } = await api.post<{ code: string }>('/auth/handoff');
    const params = new URLSearchParams({ code, next: path });
    window.location.assign(`${siteUrl(site, '/handoff')}#${params.toString()}`);
  } catch {
    // The other site still works; the person signs in there.
    window.location.assign(target);
  }
}

/** Only a same-site path is accepted as the place to land after a handoff. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  return next;
}

/** Paths served by the partner site (kept in step with PARTNER_SECTIONS in next.config.mjs). */
const PARTNER_PATH = /^\/(host|corporate|captain|insurers\/portal)(\/|$)|^\/asset-partners\/(dashboard|vehicles|statements|maintenance|documents|profile)(\/|$)/;
export const isPartnerPath = (path: string) => PARTNER_PATH.test(path);
