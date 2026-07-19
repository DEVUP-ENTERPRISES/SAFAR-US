import { config } from '@/lib/config';
import { tokenStore } from './token-store';
import { ApiError, type ApiSuccess } from './types';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  auth?: boolean; // attach bearer token (default true)
  idempotencyKey?: string;
  signal?: AbortSignal;
}

let refreshInFlight: Promise<boolean> | null = null;

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
  // Single-flight: concurrent 401s share one refresh call.
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(buildUrl('/auth/token/refresh'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
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
    })();
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
      'Cannot reach the CATO server. Make sure the backend is running on port 8080.',
      0,
    );
  }

  if (res.status === 401 && retry && opts.auth !== false) {
    const refreshed = await attemptRefresh();
    if (refreshed) return raw<T>(path, opts, false);
    tokenStore.clear();
  }

  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.success) {
    const err = json?.error;
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
