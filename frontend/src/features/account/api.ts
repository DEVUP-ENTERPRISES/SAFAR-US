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

export type ProfileField =
  | 'firstName' | 'lastName' | 'dateOfBirth' | 'phone' | 'address' | 'avatar' | 'emergencyContact';

export interface ProfileStatus {
  complete: boolean;
  missing: ProfileField[];
  underage: boolean;
  minAgeYears: number;
}

export interface OnboardingInput {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string;
  avatarUrl: string;
  address: { label?: string; line1: string; city: string; state: string; zip: string; country: string };
  emergencyContact: { name: string; phone: string; relation?: string };
}

export const accountApi = {
  me: () => api.get<Me>('/users/me'),
  updateProfile: (patch: Partial<Pick<Me, 'firstName' | 'lastName' | 'phone' | 'avatarUrl' | 'dateOfBirth'>>) =>
    api.patch<Me>('/users/me', patch),

  // Account setup gate.
  profileStatus: () => api.get<ProfileStatus>('/users/me/profile-status'),
  completeOnboarding: (dto: OnboardingInput) =>
    api.post<{ user: Me; profile: ProfileStatus }>('/users/me/onboarding', dto),

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

  // ── Notification preferences ──
  notificationPrefs: () => api.get<NotificationPrefs>('/users/me/notification-preferences'),
  updateNotificationPrefs: (patch: NotificationPrefs) =>
    api.patch<NotificationPrefs>('/users/me/notification-preferences', patch),
};

/** The six topic buckets every notification maps to (mirrors the backend). */
export const NOTIFICATION_CATEGORIES = ['trips', 'messages', 'payments', 'promotions', 'reviews', 'account'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** Opt-out model: a missing value means "allowed". */
export interface NotificationPrefs {
  push?: boolean;
  email?: boolean;
  sms?: boolean;
  smsCriticalOnly?: boolean;
  quietHours?: boolean;
  categories?: Partial<Record<NotificationCategory, boolean>>;
}
