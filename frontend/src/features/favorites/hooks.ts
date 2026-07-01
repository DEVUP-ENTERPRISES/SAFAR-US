'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/features/auth/store';
import type { Vehicle } from '@/features/vehicles/types';

export function useFavoriteIds() {
  const status = useAuthStore((s) => s.status);
  return useQuery({
    queryKey: ['favorite-ids'],
    queryFn: () => api.get<string[]>('/favorites/ids'),
    enabled: status === 'authenticated',
    staleTime: 60_000,
  });
}

export function useFavorites() {
  const status = useAuthStore((s) => s.status);
  return useQuery({
    queryKey: ['favorites'],
    queryFn: () => api.get<Vehicle[]>('/favorites'),
    enabled: status === 'authenticated',
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vehicleId, next }: { vehicleId: string; next: boolean }) =>
      next
        ? api.post('/favorites', { vehicleId })
        : api.delete(`/favorites/${vehicleId}`),
    // Optimistic update of the id set for instant heart feedback.
    onMutate: async ({ vehicleId, next }) => {
      await qc.cancelQueries({ queryKey: ['favorite-ids'] });
      const prev = qc.getQueryData<string[]>(['favorite-ids']) ?? [];
      qc.setQueryData<string[]>(
        ['favorite-ids'],
        next ? [...prev, vehicleId] : prev.filter((id) => id !== vehicleId),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['favorite-ids'], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['favorite-ids'] });
      qc.invalidateQueries({ queryKey: ['favorites'] });
    },
  });
}
