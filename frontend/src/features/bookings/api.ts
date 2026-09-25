import { api } from '@/lib/api/client';
import type { Booking, PriceBreakdown, QuoteInput, Money } from './types';
import type { Vehicle } from '@/features/vehicles/types';

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
  days?: number;
  newEnd: string;
  /** The car is taken, but the platform can make the extension work by moving the next guest. */
  swap?: { possible: true; vehicle: { id: string; make: string; model: string; year: number } };
}

export interface ReceiptLine {
  label: string;
  amount: number;
}

export interface Receipt {
  receiptNo: string;
  kind: 'original' | 'extension';
  extensionId?: string;
  issuedAt: string;
  period: { start: string; end: string };
  days: number;
  lines: ReceiptLine[];
  total: Money;
  paymentRef?: string;
}

export interface BookingReceipts {
  bookingId: string;
  code: string;
  currency: string;
  receipts: Receipt[];
  summary: { period: { start: string; end: string }; days: number; total: Money };
}

export interface ShortenPreview {
  available: boolean;
  reason?: string;
  refund?: Money;
  newEnd: string;
}

export const bookingApi = {
  /**
   * Prices a trip. The token is sent when there is one (membership pricing and
   * a price lock need it) but is not required — a visitor must be able to see a
   * price before deciding to sign up.
   */
  quote: (input: QuoteInput) => api.post<PriceBreakdown>('/bookings/quote', input, { auth: 'optional' }),
  create: (input: QuoteInput, idempotencyKey: string, coords?: { lat: number; lng: number }) =>
    api.post<Booking>('/bookings', input, {
      idempotencyKey,
      ...(coords ? { headers: { 'x-device-lat': String(coords.lat), 'x-device-lng': String(coords.lng) } } : {}),
    }),
  list: (role: 'guest' | 'host' = 'guest') =>
    api.get<Booking[]>('/bookings', { role }),
  getById: (id: string) => api.get<Booking>(`/bookings/${id}`),
  /** The original receipt plus one per extension. */
  receipts: (id: string) => api.get<BookingReceipts>(`/bookings/${id}/receipts`),
  confirm: (id: string) => api.post<Booking>(`/bookings/${id}/confirm`),
  decline: (id: string) => api.post<Booking>(`/bookings/${id}/decline`),
  /** Either side reports the other's no-show; the server decides who may and when. */
  noShow: (id: string, party: 'guest' | 'host') => api.post<Booking>(`/bookings/${id}/no-show`, { party }),
  paymentSession: (id: string) =>
    api.post<{ status: 'succeeded' | 'requires_action' | 'requires_payment_method'; clientSecret?: string }>(`/bookings/${id}/payment-session`),
  cancellationPreview: (id: string) =>
    api.get<CancellationPreview>(`/bookings/${id}/cancellation-preview`),
  extensionPreview: (id: string, newEnd: string) =>
    api.get<ExtensionPreview>(`/bookings/${id}/extension-preview`, { newEnd }),
  cancel: (id: string, reason: string) => api.post<Booking>(`/bookings/${id}/cancel`, { reason }),
  extend: (id: string, newEnd: string) => api.post<Booking>(`/bookings/${id}/extend`, { newEnd }),
  shortenPreview: (id: string, newEnd: string) =>
    api.get<ShortenPreview>(`/bookings/${id}/shorten-preview`, { newEnd }),
  shorten: (id: string, newEnd: string) => api.post<Booking>(`/bookings/${id}/shorten`, { newEnd }),
  addDriver: (id: string, name: string, licenseNumber?: string) =>
    api.post<Booking>(`/bookings/${id}/drivers`, { name, licenseNumber: licenseNumber || undefined }),
  removeDriver: (id: string, name: string) =>
    api.raw<Booking>(`/bookings/${id}/drivers/${encodeURIComponent(name)}`, { method: 'DELETE' }).then((r) => r.data),

  /** Replacement cars after a host cancellation, each priced net of the guarantee. */
  rebookingOptions: (id: string) => api.get<RebookingOptions>(`/bookings/${id}/rebooking-options`),
  rebook: (id: string, vehicleId: string) => api.post<Booking>(`/bookings/${id}/rebook`, { vehicleId }),

  /** Public receipt verification (for the receipt QR code). No auth. */
  verify: (id: string) =>
    api.get<{ valid: boolean; code?: string; status?: string; period?: { start: string; end: string }; total?: number; currency?: string; issuedAt?: string; receipts?: { receiptNo: string; kind: string; total: number; issuedAt: string }[] }>(
      `/bookings/verify/${id}`,
      undefined,
      false,
    ),
};

export interface RebookingOption {
  vehicle: Vehicle;
  total: Money;
  /** How much dearer than the original booking, in minor units. */
  difference: number;
  /** What the guarantee absorbs of that difference. */
  covered: number;
  youPay: Money;
  fullyCovered: boolean;
}

export interface RebookingOptions {
  originalTotal: Money;
  protection: {
    enabled: boolean;
    coverageBps: number;
    maxCoverageCents: number;
    expiresAt: string | null;
  };
  options: RebookingOption[];
}
