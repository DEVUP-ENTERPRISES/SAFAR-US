import { config } from '../../config';

// The production web origins, always allowed so the live site works even if CORS_ORIGINS was not updated on the server.
const ALWAYS_ALLOWED = [
  'https://www.catodrive.com',
  'https://catodrive.com',
  'https://host.catodrive.com',
  'https://partners.catodrive.com',
  'https://assets-ioc.catodrive.com',
  'https://integratedoperationscenter.catodrive.com',
];

export const allowedOrigins = (): Set<string> => new Set([...config.cors.origins, ...ALWAYS_ALLOWED]);

// Every local site (guest, admin, partner, host, operations, insurance) runs on its own port in development.
const LOCAL_DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/;
export const isLocalDevOrigin = (origin: string): boolean => !config.isProd && LOCAL_DEV_ORIGIN.test(origin);

/** The site the caller is on when it is one of ours (so Stripe sends them back there), else the first https origin; never a caller-supplied URL. */
export function returnOrigin(requestOrigin?: string): string {
  const allowed = allowedOrigins();
  if (requestOrigin && allowed.has(requestOrigin) && requestOrigin.startsWith('https://')) return requestOrigin;
  return [...allowed].find((o) => o.startsWith('https://') && !o.includes('*')) ?? config.app.publicUrl;
}
