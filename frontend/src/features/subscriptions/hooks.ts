'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store';
import { subscriptionApi, type PlanBenefits } from './api';

/** The signed-in member's live benefits, from the same record the price engine reads; cached so cards and pages render instantly. */
export function useMembership(): { isMember: boolean; benefits: PlanBenefits | null; renewsAt?: string; cancelled: boolean } {
  const status = useAuthStore((s) => s.status);
  const { data } = useQuery({
    queryKey: ['my-subscription'],
    queryFn: () => subscriptionApi.mine(),
    enabled: status === 'authenticated',
    retry: false,
    staleTime: 5 * 60_000,
  });
  const live = !!data && data.status !== 'expired' && new Date(data.renewsAt).getTime() > Date.now();
  return { isMember: live, benefits: live ? data!.benefitsSnapshot : null, renewsAt: live ? data!.renewsAt : undefined, cancelled: live && data!.status === 'cancelled' };
}
