import { config } from '../../config';

// The production web origins, always allowed so the live site works even if CORS_ORIGINS was not updated on the server.
const ALWAYS_ALLOWED = [
  'https://www.catodrive.com',
  'https://catodrive.com',
  'https://housefleet.catodrive.com',
  'https://integratedoperationscenter.catodrive.com',
];

export const allowedOrigins = (): Set<string> => new Set([...config.cors.origins, ...ALWAYS_ALLOWED]);

/** The site the caller is on when it is one of ours (so Stripe sends them back there), else the first https origin; never a caller-supplied URL. */
export function returnOrigin(requestOrigin?: string): string {
  const allowed = allowedOrigins();
  if (requestOrigin && allowed.has(requestOrigin) && requestOrigin.startsWith('https://')) return requestOrigin;
  return [...allowed].find((o) => o.startsWith('https://') && !o.includes('*')) ?? config.app.publicUrl;
}
