import { config } from '@/lib/config';

const SESSION_KEY = 'cato_visitor_session';

/** One id per browser tab session — resets on a fresh tab, not on navigation. */
function sessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // Private browsing / storage blocked — a per-call random id still lets
    // this one pageview count, it just won't dedupe against the next.
    return crypto.randomUUID();
  }
}

/**
 * Fire-and-forget pageview beacon. Never awaited, never throws into the
 * caller — a tracking failure must be invisible to the visitor.
 *
 * sendBeacon can't carry an Authorization header, so a logged-in guest's
 * visit still records but without their userId — traded deliberately for
 * sendBeacon's real advantage, that it survives the page already unloading
 * by the time it's sent (which happens on every single-page-app navigation).
 */
export function trackPageview(path: string): void {
  if (typeof window === 'undefined') return;

  const params = new URLSearchParams(window.location.search);
  const body = JSON.stringify({
    sessionId: sessionId(),
    path,
    referrer: document.referrer || undefined,
    utmSource: params.get('utm_source') || undefined,
    utmMedium: params.get('utm_medium') || undefined,
    utmCampaign: params.get('utm_campaign') || undefined,
  });

  const url = `${config.apiUrl}/analytics/track`;
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      return;
    }
  } catch {
    /* fall through to fetch */
  }
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(
    () => undefined,
  );
}
