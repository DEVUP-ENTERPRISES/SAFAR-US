import type { Money } from '../types/money';

export interface PriceBreakdown {
  days: number;
  base: Money;
  cleaningFee: Money;
  discount: Money;
  subtotal: Money;
  commission: Money; // platform take (from host portion)
  tax: Money; // tax on commission
  hostEarnings: Money;
  total: Money; // what the guest pays / hits the gateway
  currency: string;
}

export interface QuoteInput {
  vehicleId: string;
  start: Date;
  end: Date;
  couponCode?: string;
}

export interface IPricingContract {
  quote(input: QuoteInput): Promise<PriceBreakdown>;
}
