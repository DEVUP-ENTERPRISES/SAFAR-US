import { api } from '@/lib/api/client';

export interface PlanBenefits {
  /** Basis points off the rental base. 500 = 5%. */
  bookingDiscountBps: number;
  /** Surge pricing never applies to this member. */
  waiveSurge: boolean;
  /** Protection tier included at no charge. */
  freeProtectionCode?: string;
  /** 20000 = 2x reward points. */
  rewardsMultiplierBps: number;
}

export interface Plan {
  _id: string;
  code: string;
  name: string;
  description: string;
  /** Monthly, in cents. 0 = free tier. */
  priceCents: number;
  benefits: PlanBenefits;
  active: boolean;
}

export interface MySubscription {
  _id: string;
  planCode: string;
  status: 'active' | 'cancelled' | 'expired';
  /** What they bought, frozen — an admin changing the plan later cannot
   *  quietly downgrade an existing member. */
  benefitsSnapshot: PlanBenefits;
  pricePaidCents: number;
  renewsAt: string;
  cancelledAt?: string;
}

export const subscriptionApi = {
  plans: () => api.get<Plan[]>('/subscriptions/plans', undefined, false),
  mine: () => api.get<MySubscription | null>('/subscriptions/me'),
  subscribe: (planCode: string) => api.post<MySubscription>('/subscriptions/subscribe', { planCode }),
  cancel: () => api.post<{ cancelled: boolean }>('/subscriptions/cancel', {}),
};

/** Plain-language benefit lines, generated from the plan rather than hardcoded. */
export function describeBenefits(b: PlanBenefits): string[] {
  const out: string[] = [];
  if (b.bookingDiscountBps > 0) out.push(`${(b.bookingDiscountBps / 100).toFixed(0)}% off every trip`);
  if (b.waiveSurge) out.push('Never pay surge pricing');
  if (b.freeProtectionCode) out.push(`${b.freeProtectionCode} protection included free`);
  if (b.rewardsMultiplierBps > 10_000) {
    out.push(`${(b.rewardsMultiplierBps / 10_000).toFixed(b.rewardsMultiplierBps % 10_000 === 0 ? 0 : 1)}x reward points`);
  }
  return out;
}
