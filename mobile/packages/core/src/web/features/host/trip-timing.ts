// Generated from frontend/src/features/host/trip-timing.ts by mobile/tools/sync-web.js. Edit the web file, then run `npm run sync:api`.
import type { HostTrip, TimelineStep } from './trips.api';

export type TripTimingTone = 'start' | 'end' | 'done' | 'live' | 'complete' | 'off' | 'warn';

const time = (d: string) =>
  new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/**
 * The timing line is the point of a trip row: a host scanning their day needs to
 * know *what happens next with this car*, not the booking status enum.
 */
// How a finished booking ended, in the host's words.
const ENDED: Record<string, string> = {
  expired: 'Expired',
  declined: 'Declined',
  cancelled: 'Cancelled',
  cancelled_system: 'Cancelled',
  cancelled_guest: 'Cancelled by guest',
  cancelled_host: 'Cancelled by you',
};

// Only these still have a handover ahead of them.
export const TRIP_ACTIVE = ['confirmed', 'paid', 'in_progress'];

export function tripTiming(t: HostTrip): { tone: TripTimingTone; label: string } {
  const now = Date.now();
  const start = +new Date(t.period.start);
  const end = +new Date(t.period.end);
  const day = (d: string) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  if (t.status === 'completed') return { tone: 'complete', label: `Completed · ${day(t.period.end)}` };
  if (ENDED[t.status]) return { tone: 'off', label: ENDED[t.status] };
  if (t.status === 'disputed') return { tone: 'end', label: 'Disputed' };
  if (t.status === 'pending_approval') return { tone: 'warn', label: 'Request · accept or decline' };
  if (t.status === 'pending_verification') return { tone: 'warn', label: 'Waiting for guest ID' };
  if (t.status === 'pending_payment') return { tone: 'warn', label: 'Waiting for payment' };
  if (t.status !== 'in_progress' && start <= now) return { tone: 'end', label: 'Pickup time passed' };
  if (t.status === 'in_progress') {
    return end - now < 24 * 3600_000
      ? { tone: 'end', label: `Ending at ${time(t.period.end)}` }
      : { tone: 'live', label: 'On a trip' };
  }
  if (start > now && start - now < 24 * 3600_000) {
    return { tone: 'start', label: `Starting at ${time(t.period.start)}` };
  }
  return { tone: 'live', label: `Starts ${new Date(t.period.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` };
}

/** The airport handover line: flight, terminal and landing time. */
export function flightLine(trip: HostTrip): string | null {
  const d = trip.delivery;
  if (d?.mode !== 'airport' || !d.flightNumber) return null;
  return `✈ ${d.flightNumber}${d.terminal ? ` · Terminal ${d.terminal}` : ''}${
    d.arrivesAt
      ? ` · lands ${new Date(d.arrivesAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
      : ''
  }`;
}

/** One line for a trip row: what has to happen next. */
export function nextHandoverLine(timeline?: TimelineStep[] | null): string | null {
  const cur = timeline?.find((s) => s.state === 'current');
  if (!cur) return null;
  return `Next: ${cur.label}${cur.detail ? ` - ${cur.detail}` : ''}`;
}

export function dayLabel(d: Date): string {
  const today = new Date();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (sameDay(d, today)) return 'TODAY';
  if (sameDay(d, tomorrow)) return 'TOMORROW';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
}

/** Group trips under day headings (TODAY / TOMORROW / a date) like the app does. */
export function groupByDay(trips: HostTrip[], key: 'start' | 'end'): [string, HostTrip[]][] {
  const groups = new Map<string, HostTrip[]>();
  for (const t of trips) {
    const label = dayLabel(new Date(t.period[key]));
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(t);
  }
  return [...groups.entries()];
}
