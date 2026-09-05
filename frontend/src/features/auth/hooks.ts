'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { tokenStore } from '@/lib/api/token-store';
import { ApiError } from '@/lib/api/types';
import { authApi } from './api';
import { useAuthStore } from './store';
import type { AuthResult, LoginInput, RegisterInput } from './types';

/** Roles that may enter the admin back-office. */
export const ADMIN_ROLES = ['support', 'moderator', 'finance', 'ops', 'super_admin'];

export interface LoginOptions {
  /** Where to go after a successful login. */
  redirectTo?: string;
  /** If set, the account must hold at least one of these roles or login is denied. */
  requireAnyRole?: string[];
  /**
   * If set, an account holding ANY of these roles is refused. The public login
   * uses it to turn staff away: an admin session must be minted in the admin
   * app, never in the public browser context where a future XSS could reach it.
   */
  denyAnyRole?: string[];
  /** Human label for the portal (used in the denial message). */
  portalLabel?: string;
}

/** Bootstraps the session on load: if a token exists, resolve /users/me. */
export function useSessionBootstrap() {
  const setUser = useAuthStore((s) => s.setUser);

  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const me = await authApi.me();
      setUser({ id: me.id, email: me.email, roles: me.roles });
      return me;
    },
    enabled: typeof window !== 'undefined' && !!tokenStore.getAccess(),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useOnAuthSuccess() {
  const setUser = useAuthStore((s) => s.setUser);
  const qc = useQueryClient();
  return (result: AuthResult) => {
    tokenStore.set(result.tokens.accessToken, result.tokens.refreshToken);
    setUser(result.user);
    qc.invalidateQueries({ queryKey: ['me'] });
  };
}

export function useLogin(opts: LoginOptions = {}) {
  const onSuccess = useOnAuthSuccess();
  const router = useRouter();
  const redirectTo = opts.redirectTo ?? '/search';
  return useMutation({
    mutationFn: async (input: LoginInput) => {
      const result = await authApi.login(input);
      // Portal role gate: reject accounts without access to THIS portal.
      if (opts.requireAnyRole && !result.user.roles.some((r) => opts.requireAnyRole!.includes(r))) {
        throw new ApiError(
          'FORBIDDEN',
          `This account doesn't have access to the ${opts.portalLabel ?? 'requested'} portal.`,
          403,
        );
      }
      // Staff turned away from the public portal: admins sign in at the admin
      // app, so an admin session is never created here.
      if (opts.denyAnyRole && result.user.roles.some((r) => opts.denyAnyRole!.includes(r))) {
        throw new ApiError(
          'ADMIN_USE_ADMIN_PORTAL',
          'Staff accounts sign in through the admin portal, not the public site.',
          403,
        );
      }
      return result;
    },
    onSuccess: (result) => {
      onSuccess(result);
      router.push(redirectTo);
    },
  });
}

/**
 * Sign-up.
 *
 * Takes a redirect for the same reason useLogin does, and it matters more
 * here: someone stopped mid-booking who chooses "Create an account" is a NEW
 * user, which on a launching marketplace is most of them. Hardcoding /search
 * sent every one of them away from the car they were booking.
 */
export function useRegister(opts?: { redirectTo?: string }) {
  const onSuccess = useOnAuthSuccess();
  const router = useRouter();
  return useMutation({
    mutationFn: (input: RegisterInput) => authApi.register(input),
    onSuccess: (result) => {
      onSuccess(result);
      router.push(opts?.redirectTo || '/search');
    },
  });
}

export function useLogout() {
  const signOut = useAuthStore((s) => s.signOut);
  const router = useRouter();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logout().catch(() => ({ loggedOut: true })),
    onSuccess: () => {
      signOut();
      qc.clear();
      router.push('/login');
    },
  });
}
