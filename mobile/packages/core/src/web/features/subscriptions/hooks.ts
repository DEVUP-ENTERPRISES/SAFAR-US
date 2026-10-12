// Generated from frontend/src/features/subscriptions/hooks.ts by mobile/tools/sync-web.js. Edit the web file, then run `npm run sync:api`.
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../auth/store';
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

/** A member's own daily price, or null when they pay the normal price. */
export function useMemberDailyPrice(amount: number): { price: number; discountBps: number } | null {
  const { isMember, benefits } = useMembership();
  const off = benefits?.bookingDiscountBps ?? 0;
  if (!isMember || off <= 0) return null;
  return { price: Math.round((amount * (10_000 - off)) / 10_000), discountBps: off };
}
