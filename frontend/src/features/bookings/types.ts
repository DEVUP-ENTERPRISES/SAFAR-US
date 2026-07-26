import type { Money } from '@/lib/api/types';
export type { Money };

export interface PriceBreakdown {
  days: number;
  base: Money;
  cleaningFee: Money;
  discount: Money;
  addOnsTotal: Money;
  delivery: Money;
  protection: Money;
  protectionPlan: string;
  selectedAddOns: { code: string; label: string; amount: Money }[];
  subtotal: Money;
  commission: Money;
  tax: Money;
  hostEarnings: Money;
  total: Money;
  currency: string;
  commissionBps?: number;
  commissionSource?: string;
  surgeDays?: number;
  surgeSource?: string;
  memberSavings?: Money;
  memberPlan?: string;
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
  delivery?: { mode: string; address: string };
  additionalDrivers?: { name: string; licenseNumber?: string; addedAt: string }[];
  _id: string;
  code: string;
  guestId: string;
  hostId: string;
  vehicleId: string;
  period: { start: string; end: string };
  priceBreakdown: PriceBreakdown;
  status: BookingStatus;
  instantBook: boolean;
  tripId?: string;
  createdAt: string;
}

export type DeliveryMode = 'airport' | 'home' | 'hotel' | 'business';

export interface DeliveryRequest {
  mode: DeliveryMode;
  address: string;
  lat?: number;
  lng?: number;
}

export interface QuoteInput {
  vehicleId: string;
  start: string;
  end: string;
  couponCode?: string;
  addOnCodes?: string[];
  protectionPlan?: string;
  useWallet?: boolean;
  delivery?: DeliveryRequest;
}
