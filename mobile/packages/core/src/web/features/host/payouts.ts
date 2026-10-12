// Generated from frontend/src/features/host/payouts.ts by mobile/tools/sync-web.js. Edit the web file, then run `npm run sync:api`.
import { api } from '../../lib/api/client';

export interface ConnectStatus {
  connected: boolean;
  accountId?: string;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  requirementsDue: string[];
  needsOnboarding: boolean;
}

/** Stripe's requirement keys are machine names; these are the common ones. */
const REQUIREMENT_LABELS: Record<string, string> = {
  'individual.verification.document': 'A photo of your ID',
  'individual.id_number': 'Your SSN or tax ID',
  'external_account': 'Your bank account',
  'individual.address.line1': 'Your address',
  'individual.dob.day': 'Your date of birth',
  'business_profile.url': 'A website or profile link',
  'business_profile.mcc': 'What your business does',
  'tos_acceptance.date': 'Accepting Stripe’s terms',
};

export const humaniseRequirement = (k: string) => REQUIREMENT_LABELS[k] ?? k.replace(/[._]/g, ' ');

/** Stripe-hosted payout onboarding: bank details, tax identity and documents never pass through us. */
export const connectApi = {
  status: () => api.get<ConnectStatus>('/payouts/connect/status'),
  onboard: (returnPath: string) => api.post<{ url: string }>('/payouts/connect/onboard', { returnPath }),
  dashboard: () => api.post<{ url: string }>('/payouts/connect/dashboard', {}),
};

/** The instant-payout fee and what lands, same maths as the server: 1.5%, minimum $0.50. */
export function instantPayoutQuote(pendingCents: number): { fee: number; net: number } {
  const fee = Math.max(50, Math.round((pendingCents * 150) / 10000));
  return { fee, net: pendingCents - fee };
}
