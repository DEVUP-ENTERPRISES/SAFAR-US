// Generated from frontend/src/features/vehicles/calendar-pricing.ts by mobile/tools/sync-web.js. Edit the web file, then run `npm run sync:api`.
import type { Vehicle } from './types';

/** A local calendar date as YYYY-MM-DD. */
export const localDayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Days the car can't be picked up on: booked, host-blocked, or held by someone mid-checkout. */
export function busyDayKeys(occupied: { dayKey: string; state: string }[]): Set<string> {
  return new Set(occupied.filter((o) => ['booked', 'blocked', 'held'].includes(o.state)).map((o) => o.dayKey));
}

/** The shortest trip the host allows, in nights. */
export const minNightsOf = (v: Pick<Vehicle, 'listing'>) => Math.max(1, Math.ceil((v.listing?.minTripHours ?? 24) / 24));

/**
 * A night's price from the same levers the backend quote uses (weekend is
 * Saturday and Sunday, the first matching season, the live promo). A guide for
 * the calendar; the quote is authoritative.
 */
export function nightlyPrice(p: Vehicle['pricing'], d: Date): number {
  let cents = p.dailyPrice;
  const dow = d.getDay();
  if ((dow === 0 || dow === 6) && p.weekendMultiplierBps) cents = Math.round((cents * p.weekendMultiplierBps) / 10_000);
  const key = localDayKey(d);
  const season = (p.seasonalRules ?? []).find((r) => key >= r.start.slice(0, 10) && key <= r.end.slice(0, 10));
  if (season) cents = Math.round((cents * season.multiplierBps) / 10_000);
  if (p.promoActive && p.promoDiscountBps) cents = Math.round(cents * (1 - p.promoDiscountBps / 10_000));
  return cents;
}
