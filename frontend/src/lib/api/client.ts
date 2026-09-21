import { config } from '@/lib/config';
import { tokenStore } from './token-store';
import { ApiError, type ApiSuccess } from './types';
import { onSessionExpired } from './session-events';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /**
   * true (default) — send the token; a 401 means the session is over.
   * false          — never send it; this endpoint is public.
   * 'optional'     — send it if we have one, but the endpoint works without.
   *                  A 401 here is a real error, not an expired session, so it
   *                  must not sign the user out.
   */
  auth?: boolean | 'optional';
  idempotencyKey?: string;
  signal?: AbortSignal;
}

let refreshInFlight: Promise<boolean> | null = null;

/*
 * Cross-tab mutex around the refresh call.
 *
 * `refreshInFlight` only dedupes concurrent 401s WITHIN one tab — it is a
 * module-level variable, and every tab/window runs its own copy of this
 * module. Two tabs whose access tokens expire around the same moment (the
 * access TTL is 15 minutes, so this is routine, not rare) each read the SAME
 * refresh token from localStorage and each call /auth/token/refresh with it.
 * The backend rotates the refresh token on every use and treats a second use
 * of an already-rotated token as theft — it revokes the WHOLE session, not
 * just that request. So two ordinary tabs refreshing a moment apart could log
 * the person out everywhere, which is indistinguishable from a real security
 * event but isn't one.
 *
 * The Web Locks API is a real cross-tab/cross-window mutex the browser
 * arbitrates, not a localStorage flag this code would have to poll and could
 * race on itself. Only one tab's callback runs at a time under a given lock
 * name; every other requester queues until it releases. Support is broad
 * enough for this app's targets (Chrome/Edge/Firefox, Safari 15.4+); where
 * it's missing, this degrades to the single-tab-only guard that existed
 * before — no worse than the prior behaviour, not a regression.
 */
async function withCrossTabLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(name, fn);
  }
  return fn();
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(config.apiUrl + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function attemptRefresh(): Promise<boolean> {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) return false;
  // Single-flight within this tab: concurrent 401s here share one call.
  if (!refreshInFlight) {
    refreshInFlight = withCrossTabLock('cato-token-refresh', async () => {
      try {
        // Re-read after acquiring the lock — while this tab was queued,
        // another tab may have already refreshed and written new tokens to
        // localStorage. Using THIS closure's now-stale `refreshToken` would
        // be exactly the reuse the lock exists to prevent.
        const current = tokenStore.getRefresh();
        if (current !== refreshToken) return true; // another tab already did it

        const res = await fetch(buildUrl('/auth/token/refresh'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: current }),
        });
        if (!res.ok) return false;
        const json = (await res.json()) as ApiSuccess<{ accessToken: string; refreshToken: string }>;
        tokenStore.set(json.data.accessToken, json.data.refreshToken);
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => (refreshInFlight = null), 0);
      }
    });
  }
  return refreshInFlight;
}

async function raw<T>(path: string, opts: RequestOptions, retry = true): Promise<ApiSuccess<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth !== false) {
    const token = tokenStore.getAccess();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch {
    // fetch throws on network failure / server unreachable / CORS block.
    throw new ApiError(
      'NETWORK_ERROR',
      'Cannot reach the CatoDrive server. Make sure the backend is running on port 8080.',
      0,
    );
  }

  if (res.status === 401 && retry && opts.auth !== false && opts.auth !== 'optional') {
    const refreshed = await attemptRefresh();
    if (refreshed) return raw<T>(path, opts, false);
    // The session is genuinely gone. Clearing the tokens is not enough: the
    // auth store still reads "authenticated", so no guard fires and the caller
    // surfaces the raw API message ("Missing bearer token") as if it were a
    // page. Announce it instead, so the app can send the user to sign in.
    tokenStore.clear();
    onSessionExpired();
  }

  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.success) {
    const err = json?.error;

    // "Missing bearer token" is a fact about HTTP, not something a person did
    // wrong, and it has been rendering verbatim next to booking buttons. Any
    // 401 on an authenticated call means the same thing to a user — sign in —
    // so it is normalised here rather than in every component that shows an
    // error string.
    if (res.status === 401 && opts.auth !== false) {
      // Same normalisation either way — the user's action is to sign in.
      throw new ApiError('AUTH_REQUIRED', 'Please sign in to continue', 401, err?.details);
    }

    throw new ApiError(
      err?.code ?? 'UNKNOWN',
      err?.message ?? `Request failed (${res.status})`,
      res.status,
      err?.details,
    );
  }
  return json as ApiSuccess<T>;
}

/** Type-safe API surface. Returns unwrapped `data`; use `raw` for meta. */
export const api = {
  raw,
  async get<T>(path: string, query?: RequestOptions['query'], auth = true): Promise<T> {
    return (await raw<T>(path, { method: 'GET', query, auth })).data;
  },
  async post<T>(path: string, body?: unknown, opts?: Partial<RequestOptions>): Promise<T> {
    return (await raw<T>(path, { method: 'POST', body, ...opts })).data;
  },
  async patch<T>(path: string, body?: unknown): Promise<T> {
    return (await raw<T>(path, { method: 'PATCH', body })).data;
  },
  async delete<T>(path: string): Promise<T> {
    return (await raw<T>(path, { method: 'DELETE' })).data;
  },
};
