/** Resolve a `next`-style param to a same-origin path, or the fallback; blocks //host, /\host, absolute and script URLs. */
export function safeRedirect(next: string | null | undefined, fallback = '/search'): string {
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
