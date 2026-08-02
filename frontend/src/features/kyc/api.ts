import { api } from '@/lib/api/client';

export type KycStatus = 'not_started' | 'pending' | 'approved' | 'rejected';

export interface KycStatusView {
  status: KycStatus | string;
  level?: string;
  reason?: string;
}

export interface VerificationSession {
  provider: 'stripe' | 'stub';
  sessionId: string;
  /** Present for the live Stripe flow — opens the hosted capture modal. */
  clientSecret?: string;
  /** Hosted fallback URL, or the stub's about:blank in dev. */
  url?: string;
}

export const kycApi = {
  status: () => api.get<KycStatusView>('/kyc/status'),

  /** Begin an automated identity check; the decision returns by webhook. */
  startVerification: () => api.post<VerificationSession>('/kyc/verification-session', {}),

  /**
   * Dev-only shortcut: force a decision when no live provider is configured, so
   * the flow is exercisable offline. The route simply doesn't exist in prod, so
   * this 404s harmlessly there.
   */
  devDecide: (status: 'verified' | 'rejected', reason?: string) =>
    api.post('/kyc/dev/decide', { status, reason }),
};
