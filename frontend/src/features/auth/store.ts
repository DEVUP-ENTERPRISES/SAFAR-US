'use client';

import { create } from 'zustand';
import { tokenStore } from '@/lib/api/token-store';
import { subscribeSessionExpired } from '@/lib/api/session-events';
import type { AuthUser } from './types';

interface AuthState {
  user: AuthUser | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  setUser: (user: AuthUser | null) => void;
  setStatus: (status: AuthState['status']) => void;
  signOut: () => void;
}

/** Global auth state. Server truth comes from React Query; this holds the
 *  resolved principal for synchronous UI decisions (guards, nav). */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'loading',
  setUser: (user) => set({ user, status: user ? 'authenticated' : 'unauthenticated' }),
  setStatus: (status) => set({ status }),
  signOut: () => {
    tokenStore.clear();
    set({ user: null, status: 'unauthenticated' });
  },
}));

/*
 * When a 401 outlives a refresh, the API layer announces it here. Flipping the
 * store to "unauthenticated" is what makes every AuthGuard redirect to its
 * portal's sign-in page — without this the token was cleared but the app still
 * believed it was signed in, so the user was shown the raw API error
 * ("Missing bearer token") instead of a login screen.
 */
subscribeSessionExpired(() => {
  if (useAuthStore.getState().status !== 'unauthenticated') {
    useAuthStore.setState({ user: null, status: 'unauthenticated' });
  }
});

export function hasRole(user: AuthUser | null, role: string): boolean {
  return !!user?.roles.includes(role);
}
