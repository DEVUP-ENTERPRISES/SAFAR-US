// App-owned replacement for frontend/src/lib/api/token-store.ts: same synchronous API, persisted in the device keychain.
import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'cato.access';
const REFRESH_KEY = 'cato.refresh';

let access: string | null = null;
let refresh: string | null = null;

const persist = (key: string, value: string | null) =>
  (value ? SecureStore.setItemAsync(key, value) : SecureStore.deleteItemAsync(key)).catch(() => undefined);

export const tokenStore = {
  getAccess: (): string | null => access,
  getRefresh: (): string | null => refresh,
  set(a: string, r: string): void {
    access = a;
    refresh = r;
    void persist(ACCESS_KEY, a);
    void persist(REFRESH_KEY, r);
  },
  setAccess(a: string): void {
    access = a;
    void persist(ACCESS_KEY, a);
  },
  clear(): void {
    access = null;
    refresh = null;
    void persist(ACCESS_KEY, null);
    void persist(REFRESH_KEY, null);
  },
};

/** Loads saved tokens before the first request; the app shell awaits this once at start-up. */
export async function hydrateTokens(): Promise<void> {
  try {
    [access, refresh] = await Promise.all([SecureStore.getItemAsync(ACCESS_KEY), SecureStore.getItemAsync(REFRESH_KEY)]);
  } catch {
    access = null;
    refresh = null;
  }
}
