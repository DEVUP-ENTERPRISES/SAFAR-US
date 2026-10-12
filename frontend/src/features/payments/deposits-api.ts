import { api } from '@/lib/api/client';
import type { Money } from '@/lib/api/types';

/** A booking's security deposit, as the guest and host see it. */
export interface DepositState {
  held: boolean;
  status?: 'authorized' | 'captured' | 'released' | 'partially_captured' | string;
  enabled?: boolean;
  amount?: Money;
  captured?: Money;
  reason?: string | null;
  settledAt?: string | null;
  releaseHours?: number;
  opensAt?: string;
  requiredAtHandover?: boolean;
}

/** What placing the deposit needs right now: nothing, a card payment, or waiting until it opens. */
export type DepositSession =
  | { status: 'held' | 'not_needed'; amount: Money }
  | { status: 'needs_payment'; clientSecret: string; amount: Money }
  | { status: 'too_early'; amount: Money; opensAt: string };

export const depositsApi = {
  get: (bookingId: string) => api.get<DepositState>(`/payments/deposits/${bookingId}`),
  session: (bookingId: string) => api.post<DepositSession>(`/bookings/${bookingId}/deposit-session`, {}),
};
