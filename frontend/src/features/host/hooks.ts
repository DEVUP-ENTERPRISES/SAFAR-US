'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hostApi, type HostProfile } from './api';

export function useHostMe() {
  return useQuery({ queryKey: ['host-me'], queryFn: () => hostApi.me(), retry: false });
}

export function useOnboardHost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (displayName: string) => hostApi.onboard(displayName),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['host-me'] }),
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
