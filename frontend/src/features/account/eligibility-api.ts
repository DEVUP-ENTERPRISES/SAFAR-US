import { api } from '@/lib/api/client';

/** What still stands between the guest and driving: contact checks, identity, expiry. */
export interface Eligibility {
  eligible: boolean;
  canRequest: boolean;
  blockers: string[];
  messages: string[];
}

export const eligibilityApi = {
  get: () => api.get<Eligibility>('/bookings/eligibility'),
  send: (channel: 'email' | 'phone') =>
    api.post<{ sent: boolean; to: string; via: string; devCode?: string; message?: string }>('/users/me/verify-contact/send', { channel }),
  confirm: (channel: 'email' | 'phone', code: string) => api.post<{ verified: boolean }>('/users/me/verify-contact/confirm', { channel, code }),
};
