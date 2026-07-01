import { api } from '@/lib/api/client';
import type { AuthResult, LoginInput, Me, RegisterInput } from './types';

export const authApi = {
  register: (input: RegisterInput) => api.post<AuthResult>('/auth/register', input, { auth: false }),
  login: (input: LoginInput) => api.post<AuthResult>('/auth/login', input, { auth: false }),
  logout: () => api.post<{ loggedOut: boolean }>('/auth/logout'),
  me: () => api.get<Me>('/users/me'),
};
