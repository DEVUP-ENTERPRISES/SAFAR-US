import { config } from '../../config';

// Which website serves a path; kept in step with siteForPath() in frontend/src/lib/sites.ts.
const HOST_PATH = /^\/(host|captain)(\/|\?|$)/;
const PARTNER_PATH = /^\/insurers\/portal(\/|\?|$)|^\/asset-partners\/(dashboard|vehicles|statements|maintenance|documents|profile)(\/|\?|$)/;

export type Site = 'guest' | 'host' | 'partner';

export function siteForPath(path: string): Site {
  if (HOST_PATH.test(path)) return 'host';
  if (PARTNER_PATH.test(path)) return 'partner';
  return 'guest';
}

// A site with no URL configured falls back to the guest site, so a link is never relative.
export function webLink(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const rel = path.startsWith('/') ? path : `/${path}`;
  const guest = config.notifications.webUrl || config.app.publicUrl;
  const site = siteForPath(rel);
  const base = site === 'host' ? config.notifications.hostWebUrl : site === 'partner' ? config.notifications.partnerWebUrl : '';
  return `${base || guest}${rel}`;
}
