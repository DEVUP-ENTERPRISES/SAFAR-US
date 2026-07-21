'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api/types';
import { useAuthStore } from '@/features/auth/store';
import { hostApi, type HostProfile } from './api';

/** A 404 from /hosts/me is the one definitive "this user is not a host". */
export function isNotAHost(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/**
 * The host gate. This query decides whether someone sees their dashboard or the
 * "become a host" pitch, so it must never mistake a blip for "not a host":
 *
 *  - transient failures (network, 401 mid-refresh, 5xx) are retried; only a 404
 *    is treated as an answer;
 *  - it always revalidates on mount, so a 404 cached from before someone
 *    onboarded can't strand them on the signup screen.
 */
export function useHostMe() {
  const status = useAuthStore((s) => s.status);
  return useQuery({
    queryKey: ['host-me'],
    queryFn: () => hostApi.me(),
    // Asking "am I a host?" while logged out just produces guaranteed 401s.
    enabled: status === 'authenticated',
    retry: (count, error) => !isNotAHost(error) && count < 2,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/**
 * Is the signed-in user already a host? Used by shared chrome (navbar, home
 * CTA) so we stop inviting existing hosts to "become a host".
 * `undefined` = still unknown; callers should keep the neutral label.
 */
export function useIsHost(): boolean | undefined {
  const { data, isError, error } = useHostMe();
  if (data) return true;
  if (isError && isNotAHost(error)) return false;
  return undefined; // still loading, or a transient error — don't guess
}

export function useOnboardHost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (displayName: string) => hostApi.onboard(displayName),
    // Seed the cache with the new profile directly: invalidate alone leaves a
    // window where the cached 404 is still what the gate reads, which flashes
    // the signup screen at someone who just signed up.
    onSuccess: (host) => {
      qc.setQueryData(['host-me'], host);
      qc.invalidateQueries({ queryKey: ['host-me'] });
    },
  });
}

export function useUpdateHostProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<HostProfile>) => hostApi.updateProfile(patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['host-me'] }),
  });
}

export function useEarnings() {
  return useQuery({ queryKey: ['earnings'], queryFn: () => hostApi.earnings() });
}

export function usePayouts() {
  return useQuery({ queryKey: ['payouts'], queryFn: () => hostApi.payouts() });
}

export function useInstantPayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => hostApi.instantPayout(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['earnings'] });
      qc.invalidateQueries({ queryKey: ['payouts'] });
    },
  });
}
