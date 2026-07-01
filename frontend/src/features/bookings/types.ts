import type { Money } from '@/lib/api/types';

export interface PriceBreakdown {
  days: number;
  base: Money;
  cleaningFee: Money;
  discount: Money;
  subtotal: Money;
  commission: Money;
  tax: Money;
  hostEarnings: Money;
  total: Money;
  currency: string;
}

export type BookingStatus =
  | 'pending_approval'
  | 'confirmed'
  | 'paid'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'declined'
  | 'expired'
  | 'disputed';

export interface Booking {
  _id: string;
  code: string;
  guestId: string;
  hostId: string;
  vehicleId: string;
  period: { start: string; end: string };
  priceBreakdown: PriceBreakdown;
  status: BookingStatus;
  instantBook: boolean;
  createdAt: string;
}

export interface QuoteInput {
  vehicleId: string;
  start: string;
  end: string;
  couponCode?: string;
}
