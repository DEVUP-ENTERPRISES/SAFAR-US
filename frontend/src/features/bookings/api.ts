import { api } from '@/lib/api/client';
import type { Booking, PriceBreakdown, QuoteInput } from './types';

export const bookingApi = {
  quote: (input: QuoteInput) => api.post<PriceBreakdown>('/bookings/quote', input),
  create: (input: QuoteInput, idempotencyKey: string) =>
    api.post<Booking>('/bookings', input, { idempotencyKey }),
  list: (role: 'guest' | 'host' = 'guest') =>
    api.get<Booking[]>('/bookings', { role }),
  getById: (id: string) => api.get<Booking>(`/bookings/${id}`),
  confirm: (id: string) => api.post<Booking>(`/bookings/${id}/confirm`),
  decline: (id: string) => api.post<Booking>(`/bookings/${id}/decline`),
  cancel: (id: string, reason: string) => api.post<Booking>(`/bookings/${id}/cancel`, { reason }),
  extend: (id: string, newEnd: string) => api.post<Booking>(`/bookings/${id}/extend`, { newEnd }),
};
