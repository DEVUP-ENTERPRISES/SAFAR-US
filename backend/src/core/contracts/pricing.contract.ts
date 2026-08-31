import type { Money } from '../types/money';

export interface PriceBreakdown {
  days: number;
  base: Money;
  cleaningFee: Money;
  discount: Money;
  addOnsTotal: Money;
  delivery: Money; // host delivers the car to the guest — accrues to the host
  protection: Money;
  protectionPlan: string;
  selectedAddOns: { code: string; label: string; amount: Money }[];
  subtotal: Money;
  commission: Money; // platform take (from host portion)
  tax: Money; // platform tax on commission (deducted from host earnings)
  /**
   * Rental tax charged TO the guest and remitted by the platform — state sales
   * tax, motor-vehicle excise, city surcharge, airport concession. Separate
   * lines because each is levied and remitted by a different authority, and the
   * guest is entitled to see which is which.
   */
  taxLines?: { ruleId: string; label: string; kind: string; scope: string; rateBps: number; amount: number }[];
  /** Sum of taxLines. Included in `total`. */
  taxTotal?: Money;
  hostEarnings: Money;
  total: Money; // what the guest pays / hits the gateway
  currency: string;
  /** The commission rate applied to this booking, in basis points. */
  commissionBps?: number;
  /** Which commission rule produced that rate, e.g. "category:luxury" or "default". */
  commissionSource?: string;
  /** How many days of the trip were surged, and why. Shown to the guest. */
  surgeDays?: number;
  surgeSource?: string;
  /** Membership savings applied (CATO Plus), in minor units. */
  memberSavings?: Money;
  memberPlan?: string;
}

export interface QuoteInput {
  vehicleId: string;
  start: Date;
  end: Date;
  couponCode?: string;
  addOnCodes?: string[];
  protectionPlan?: string;
  /** Who is booking — lets membership (CATO Plus) benefits apply to the price. */
  guestId?: string;
  /** Guest asks the host to deliver the car here (adds the host's delivery fee). */
  delivery?: DeliveryRequest;
}

export type DeliveryMode = 'airport' | 'home' | 'hotel' | 'business';

export interface DeliveryRequest {
  mode: DeliveryMode;
  address: string;
  lat?: number;
  lng?: number;
}

export interface IPricingContract {
  quote(input: QuoteInput): Promise<PriceBreakdown>;
}
