// App-owned replacement for frontend/src/lib/api/platform.ts: app headers, request timeout, retries for safe reads.
import { appInfo } from '../../../app-info';

const TIMEOUT_MS = Number(process.env.EXPO_PUBLIC_API_TIMEOUT_MS ?? 20000);
const GET_RETRIES = 2;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function once(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const outer = init.signal;
  const onAbort = () => ctrl.abort();
  outer?.addEventListener('abort', onAbort);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onAbort);
  }
}

export const platform = {
  headers: (): Record<string, string> => ({
    'X-Client-Type': 'mobile',
    'X-App': appInfo.id,
    'X-App-Version': appInfo.version,
  }),
  async fetch(url: string, init: RequestInit): Promise<Response> {
    const idempotent = !init.method || init.method === 'GET';
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await once(url, init);
        if (idempotent && res.status >= 502 && res.status <= 504 && attempt < GET_RETRIES) {
          await wait(400 * 2 ** attempt);
          continue;
        }
        return res;
      } catch (err) {
        if (!idempotent || init.signal?.aborted || attempt >= GET_RETRIES) throw err;
        await wait(400 * 2 ** attempt);
      }
    }
  },
};
