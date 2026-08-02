import { api } from '@/lib/api/client';
import type { Me, Address, EmergencyContact } from '@/features/auth/types';

export interface SessionView {
  id: string;
  userAgent?: string;
  ip?: string;
  createdAt: string;
  current: boolean;
}

export interface PaymentMethod {
  _id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
  provider: string;
}

export const accountApi = {
  me: () => api.get<Me>('/users/me'),
  updateProfile: (patch: Partial<Pick<Me, 'firstName' | 'lastName' | 'phone' | 'avatarUrl' | 'dateOfBirth'>>) =>
    api.patch<Me>('/users/me', patch),

  addAddress: (a: Omit<Address, 'id' | 'isDefault'> & { isDefault?: boolean }) =>
    api.post<Me>('/users/me/addresses', a),
  removeAddress: (id: string) => api.delete<Me>(`/users/me/addresses/${id}`),
  setDefaultAddress: (id: string) => api.post<Me>(`/users/me/addresses/${id}/default`),

  addContact: (c: Omit<EmergencyContact, 'id'>) => api.post<Me>('/users/me/emergency-contacts', c),
  removeContact: (id: string) => api.delete<Me>(`/users/me/emergency-contacts/${id}`),

  sessions: () => api.get<SessionView[]>('/auth/sessions'),
  revokeSession: (id: string) => api.delete(`/auth/sessions/${id}`),
  logoutOthers: () => api.post('/auth/logout/all'),

  // ── MFA (TOTP) ──
  mfaStatus: () => api.get<{ enabled: boolean }>('/users/me/mfa'),
  mfaSetup: () => api.post<{ secret: string; otpauthUrl: string }>('/users/me/mfa/setup'),
  mfaEnable: (token: string) => api.post<{ enabled: boolean }>('/users/me/mfa/enable', { token }),
  mfaDisable: (token: string) => api.post<{ enabled: boolean }>('/users/me/mfa/disable', { token }),

  // ── Saved payment methods ──
  paymentMethods: () => api.get<PaymentMethod[]>('/payments/methods'),
  savePaymentMethod: (card: { brand: string; last4: string; expMonth: number; expYear: number }) =>
    api.post<PaymentMethod>('/payments/methods', card),
  removePaymentMethod: (id: string) => api.delete(`/payments/methods/${id}`),
  setDefaultPaymentMethod: (id: string) => api.post(`/payments/methods/${id}/default`),

  kycStatus: () => api.get<{ status: string; level?: string; reason?: string }>('/kyc/status'),
};
