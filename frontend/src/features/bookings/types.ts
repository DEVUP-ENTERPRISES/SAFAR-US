import type { Money } from '@/lib/api/types';
export type { Money };

export interface PriceBreakdown {
  /** What a non-member would save on THIS trip by joining. Absent for members
   *  and when no plan would beat its own monthly cost. */
  memberOffer?: { planCode: string; planName: string; monthlyCents: number; savings: { amount: number; currency: string } };
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

/**
 * Mirrors the backend BookingStatus exactly. It had drifted: the states a
 * booking is actually held in while waiting on verification, and the three
 * cancellation states that record WHO cancelled, were missing — so any UI
 * switching on status silently failed to handle them.
 */
export type BookingStatus =
  | 'pending_verification'
  | 'pending_approval'
  | 'confirmed'
  | 'paid'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'cancelled_guest'
  | 'cancelled_host'
  | 'cancelled_system'
  | 'declined'
  | 'expired'
  | 'disputed';

export interface Booking {
  /** Set when the card needs the cardholder — a 3-D Secure challenge. The trip
   *  is held, not confirmed, until the client finishes it. */
  requiresAction?: boolean;
  clientSecret?: string;
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
