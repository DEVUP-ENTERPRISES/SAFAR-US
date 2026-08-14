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
      return result;
    },
    onSuccess: (result) => {
      onSuccess(result);
      router.push(redirectTo);
    },
  });
}

export function useRegister() {
  const onSuccess = useOnAuthSuccess();
  const router = useRouter();
  return useMutation({
    mutationFn: (input: RegisterInput) => authApi.register(input),
    onSuccess: (result) => {
      onSuccess(result);
      router.push('/search');
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
