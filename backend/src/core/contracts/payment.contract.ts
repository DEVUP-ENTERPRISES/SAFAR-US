import type { Money } from '../types/money';

/** Public interface of the Payments module. Callers depend on this, not the impl. */
export interface ChargeBookingInput {
  bookingId: string;
  guestId: string;
  hostId: string;
  capture: boolean; // instant book → true; request-to-book → false (authorize only)
  total: Money;
  hostEarnings: Money;
  commission: Money;
  tax: Money;
  walletApplied?: number; // minor units funded from wallet → card charges the remainder
  idempotencyKey: string;
}

export interface ChargeResult {
  paymentId: string;
  intentId: string;
  clientSecret: string;
  status: string;
}

export interface IPaymentContract {
  chargeForBooking(input: ChargeBookingInput): Promise<ChargeResult>;
  captureBooking(bookingId: string): Promise<void>;
  refundBooking(bookingId: string, amount: Money, reason: string): Promise<void>;
  cancelAuthorization(bookingId: string): Promise<void>;
}
