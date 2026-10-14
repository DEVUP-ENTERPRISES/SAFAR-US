import { config } from '../../config';

/** Paths served by the partner website (host, captain, corporate, the insurer and Asset Partner portals). */
const PARTNER_PATH = /^\/(host|corporate|captain|insurers\/portal)(\/|\?|$)|^\/asset-partners\/(dashboard|vehicles|statements|maintenance|documents|profile)(\/|\?|$)/;

export const isPartnerPath = (path: string) => PARTNER_PATH.test(path);

/**
 * The absolute web link a person should follow for an app path: partner pages
 * on the partner site, everything else on the guest site. Falls back to the
 * API base only when no web URL is configured, so a link is never relative.
 */
export function webLink(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const rel = path.startsWith('/') ? path : `/${path}`;
  const guest = config.notifications.webUrl || config.app.publicUrl;
  const base = isPartnerPath(rel) ? config.notifications.partnerWebUrl || guest : guest;
  return `${base}${rel}`;
}
