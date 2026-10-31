// Generated from frontend/src/features/claims/claim-trips.ts by mobile/tools/sync-web.js. Edit the web file, then run `npm run sync:api`.
import type { Booking } from '../bookings/types';

const CLAIMABLE = new Set(['confirmed', 'paid', 'in_progress', 'completed', 'disputed']);

/** Trips a guest can file a claim about, newest first. */
export function claimableTrips(bookings: Booking[] | undefined): Booking[] {
  return (bookings ?? []).filter((b) => CLAIMABLE.has(b.status)).sort((a, b) => +new Date(b.period.start) - +new Date(a.period.start));
}

/** "ABC123 · Oct 2 – Oct 5" */
export function tripLabel(b: Pick<Booking, 'code' | 'period'>): string {
  const d = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${b.code} · ${d(b.period.start)} – ${d(b.period.end)}`;
}
