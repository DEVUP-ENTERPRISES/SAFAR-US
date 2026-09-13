import { api } from '@/lib/api/client';
import type { AuthResult, LoginInput, Me, RegisterInput } from './types';

export const authApi = {
  register: (input: RegisterInput) => api.post<AuthResult>('/auth/register', input, { auth: false }),
  login: (input: LoginInput) => api.post<AuthResult>('/auth/login', input, { auth: false }),
  logout: () => api.post<{ loggedOut: boolean }>('/auth/logout'),

  /** Send a 6-digit code to a phone. Signs in or creates the account on verify. */
  requestPhoneOtp: (phone: string) =>
    api.post<{ sent: boolean }>('/auth/otp/phone/request', { phone }, { auth: false }),
  verifyPhoneOtp: (phone: string, code: string) =>
    api.post<AuthResult>('/auth/otp/phone/verify', { phone, code }, { auth: false }),

  /** Exchange a Google ID token (from Google Identity Services) for a session. */
  google: (idToken: string) =>
    api.post<AuthResult>('/auth/oauth/google', { idToken }, { auth: false }),
  me: () => api.get<Me>('/users/me'),

  /** Forgot password: request a reset code, then set a new password with it. */
  forgotPassword: (email: string) =>
    api.post<{ sent: boolean; devCode?: string }>('/auth/password/forgot', { email }, { auth: false }),
  resetPassword: (email: string, code: string, password: string) =>
    api.post<{ reset: boolean }>('/auth/password/reset', { email, code, password }, { auth: false }),
};
