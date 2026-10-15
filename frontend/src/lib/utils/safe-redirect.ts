/** Where sign-in lands by default: the host and partner sites' own home (it routes to the right dashboard), search on the guest site. */
const DEFAULT_LANDING = process.env.NEXT_PUBLIC_APP_SURFACE === 'partner' || process.env.NEXT_PUBLIC_APP_SURFACE === 'host' ? '/' : '/search';

/** Resolve a `next`-style param to a same-origin path, or the fallback; blocks //host, /\host, absolute and script URLs. */
export function safeRedirect(next: string | null | undefined, fallback = DEFAULT_LANDING): string {
  if (!next || next.includes('\\') || !next.startsWith('/')) return fallback;
  try {
    const base = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
    const url = new URL(next, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
