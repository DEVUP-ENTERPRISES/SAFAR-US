import { api } from '@/lib/api/client';
import type { Booking, PriceBreakdown, QuoteInput, Money } from './types';

export interface CancellationPreview {
  total: Money;
  refund: Money;
  nonRefundable: Money;
  policy: 'flexible' | 'moderate' | 'strict';
  fullRefundUntil: string | null;
  isFullRefund: boolean;
  cancellable: boolean;
  hostPenalty?: { affectsStanding: boolean; note: string };
}

export interface ExtensionPreview {
  available: boolean;
  reason?: string;
  extraCost?: Money;
  newEnd: string;
}

export const bookingApi = {
  quote: (input: QuoteInput) => api.post<PriceBreakdown>('/bookings/quote', input),
  create: (input: QuoteInput, idempotencyKey: string) =>
    api.post<Booking>('/bookings', input, { idempotencyKey }),
  list: (role: 'guest' | 'host' = 'guest') =>
    api.get<Booking[]>('/bookings', { role }),
  getById: (id: string) => api.get<Booking>(`/bookings/${id}`),
  confirm: (id: string) => api.post<Booking>(`/bookings/${id}/confirm`),
  decline: (id: string) => api.post<Booking>(`/bookings/${id}/decline`),
  cancellationPreview: (id: string) =>
    api.get<CancellationPreview>(`/bookings/${id}/cancellation-preview`),
  extensionPreview: (id: string, newEnd: string) =>
    api.get<ExtensionPreview>(`/bookings/${id}/extension-preview`, { newEnd }),
  cancel: (id: string, reason: string) => api.post<Booking>(`/bookings/${id}/cancel`, { reason }),
  extend: (id: string, newEnd: string) => api.post<Booking>(`/bookings/${id}/extend`, { newEnd }),
  addDriver: (id: string, name: string, licenseNumber?: string) =>
    api.post<Booking>(`/bookings/${id}/drivers`, { name, licenseNumber: licenseNumber || undefined }),
  removeDriver: (id: string, name: string) =>
    api.raw<Booking>(`/bookings/${id}/drivers/${encodeURIComponent(name)}`, { method: 'DELETE' }).then((r) => r.data),
};
