// Generated from frontend/src/features/bookings/booking-selection.ts by mobile/tools/sync-web.js. Edit the web file, then run `npm run sync:api`.
import type { DeliveryMode, QuoteInput } from './types';

/** Everything a guest picks on the car page before booking. Dates are local "YYYY-MM-DDTHH:mm". */
export interface BookingChoices {
  start: string;
  end: string;
  addOnCodes: string[];
  protectionPlan: string;
  payWithWallet: boolean;
  payOther: boolean;
  deliveryMode: DeliveryMode | '';
  deliveryLocationId: string;
  deliveryAddress: string;
  flightNumber: string;
  terminal: string;
  arrivesAt: string;
  /** The promo code that has been applied (not just typed). */
  appliedCoupon: string;
}

export const EMPTY_CHOICES: BookingChoices = {
  start: '',
  end: '',
  addOnCodes: [],
  protectionPlan: 'basic',
  payWithWallet: false,
  payOther: false,
  deliveryMode: '',
  deliveryLocationId: '',
  deliveryAddress: '',
  flightNumber: '',
  terminal: '',
  arrivesAt: '',
  appliedCoupon: '',
};

/** A local date-time as an ISO instant. */
export const localToIso = (local: string): string => new Date(local).toISOString();

/** Delivery needs an address, and an airport delivery a flight number, before a trip can be priced. */
export function deliveryReady(c: Pick<BookingChoices, 'deliveryMode' | 'deliveryAddress' | 'flightNumber'>): boolean {
  return !c.deliveryMode || (c.deliveryAddress.trim().length > 2 && (c.deliveryMode !== 'airport' || c.flightNumber.trim().length >= 3));
}

/** Dates picked and delivery complete: the quote can be asked for. */
export const canQuote = (c: BookingChoices) => !!(c.start && c.end && deliveryReady(c));

/** Whole days between two local date-times, at least one. */
export function tripDays(start: string, end: string): number | undefined {
  return start && end ? Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000)) : undefined;
}

/** The quote and booking request for these choices; the wallet only applies to Instant Book. */
export function bookingInput(vehicleId: string, c: BookingChoices, ctx: { instantBook: boolean; termsVersion?: string }): QuoteInput {
  return {
    vehicleId,
    start: localToIso(c.start),
    end: localToIso(c.end),
    couponCode: c.appliedCoupon.trim() || undefined,
    addOnCodes: c.addOnCodes,
    protectionPlan: c.protectionPlan,
    useWallet: c.payWithWallet && ctx.instantBook,
    payWith: c.payOther ? ('other' as const) : undefined,
    acceptedTermsVersion: ctx.termsVersion,
    delivery:
      c.deliveryMode && c.deliveryAddress.trim()
        ? {
            mode: c.deliveryMode,
            locationId: c.deliveryLocationId || undefined,
            address: c.deliveryAddress.trim(),
            ...(c.deliveryMode === 'airport'
              ? {
                  flightNumber: c.flightNumber.trim().toUpperCase() || undefined,
                  terminal: c.terminal.trim() || undefined,
                  arrivesAt: c.arrivesAt ? new Date(c.arrivesAt).toISOString() : undefined,
                }
              : {}),
          }
        : undefined,
  };
}

/** When free cancellation ends for a trip starting at `start`, or null once it has passed. */
export function freeCancellationUntil(start: string, fullBeforeHours: number | undefined): Date | null {
  if (!start || fullBeforeHours === undefined) return null;
  const deadline = new Date(new Date(start).getTime() - fullBeforeHours * 3_600_000);
  return deadline.getTime() > Date.now() ? deadline : null;
}
