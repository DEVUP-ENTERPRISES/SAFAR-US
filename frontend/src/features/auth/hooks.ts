'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { authApi } from './api';
import { loginWithGate, signOutEverywhere, useOnAuthSuccess, type LoginOptions } from './session';
import type { LoginInput, RegisterInput } from './types';

export { ADMIN_ROLES, useSessionBootstrap, useOnAuthSuccess, type LoginOptions } from './session';

export function useLogin(opts: LoginOptions = {}) {
  const onSuccess = useOnAuthSuccess();
  const router = useRouter();
  const redirectTo = opts.redirectTo ?? '/search';
  return useMutation({
    mutationFn: (input: LoginInput) => loginWithGate(input, opts),
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
  const router = useRouter();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => signOutEverywhere(qc),
    onSuccess: () => router.push('/login'),
  });
}
