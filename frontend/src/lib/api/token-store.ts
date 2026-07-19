/**
 * Token persistence. Access token is kept in memory + localStorage for
 * reloads; refresh token in localStorage. (For hardened prod, move refresh
 * to an httpOnly cookie via a Next route handler — the client API here is
 * designed so only this file changes.)
 */
const ACCESS_KEY = 'cato.access';
const REFRESH_KEY = 'cato.refresh';

let accessTokenMemory: string | null = null;

export const tokenStore = {
  getAccess(): string | null {
    if (accessTokenMemory) return accessTokenMemory;
    if (typeof window === 'undefined') return null;
    accessTokenMemory = window.localStorage.getItem(ACCESS_KEY);
    return accessTokenMemory;
  },
  getRefresh(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string): void {
    accessTokenMemory = access;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ACCESS_KEY, access);
      window.localStorage.setItem(REFRESH_KEY, refresh);
    }
  },
  setAccess(access: string): void {
    accessTokenMemory = access;
    if (typeof window !== 'undefined') window.localStorage.setItem(ACCESS_KEY, access);
  },
  clear(): void {
    accessTokenMemory = null;
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ACCESS_KEY);
      window.localStorage.removeItem(REFRESH_KEY);
    }
  },
};
