'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { tokenStore } from '@/lib/api/token-store';
import { authApi } from './api';
import { useAuthStore } from './store';
import type { AuthResult, LoginInput, RegisterInput } from './types';

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

function useOnAuthSuccess() {
  const setUser = useAuthStore((s) => s.setUser);
  const qc = useQueryClient();
  return (result: AuthResult) => {
    tokenStore.set(result.tokens.accessToken, result.tokens.refreshToken);
    setUser(result.user);
    qc.invalidateQueries({ queryKey: ['me'] });
  };
}

export function useLogin() {
  const onSuccess = useOnAuthSuccess();
  const router = useRouter();
  return useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: (result) => {
      onSuccess(result);
      router.push('/search');
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
