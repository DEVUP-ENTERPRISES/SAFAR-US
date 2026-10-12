import type { Money } from '@/lib/api/types';

/** Backend money is integer minor units + ISO currency. Render as currency. */
export function formatMoney(m: Money | undefined | null): string {
  if (!m) return '-';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: m.currency,
      // Whole dollars stay whole ($45); anything with cents shows them ($2.50), so a fee or discount is never rounded away.
      minimumFractionDigits: m.amount % 100 === 0 ? 0 : 2,
      maximumFractionDigits: m.amount % 100 === 0 ? 0 : 2,
    }).format(m.amount / 100);
  } catch {
    return `${(m.amount / 100).toFixed(m.amount % 100 === 0 ? 0 : 2)} ${m.currency}`;
  }
}

/** A wall-clock "HH:mm" as US guests read it: "10:00 AM". */
export function formatClock(t: string): string {
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return t;
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function formatDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * A calendar date with no time of day: a birthday, a licence or document expiry. These are stored as midnight UTC,
 * so they must be shown in UTC; a viewer in Texas would otherwise see the day before.
 */
export function formatDay(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value) : value;
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function formatDateTime(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleString('en-US', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function formatDateRange(start: string | Date, end: string | Date): string {
  return `${formatDate(start)} → ${formatDate(end)}`;
}

/** Stored fuel-type values are internal; a US audience reads "Gas", not "petrol". */
export const FUEL_LABEL: Record<'petrol' | 'diesel' | 'hybrid' | 'ev', string> = {
  petrol: 'Gas', diesel: 'Diesel', hybrid: 'Hybrid', ev: 'Electric',
};

/** The app stores distance in km; a US audience reads miles. */
export const kmToMiles = (km: number) => Math.round(km * 0.621371);
export const milesToKm = (mi: number) => Math.round(mi / 0.621371);
/** Per-mile money from a per-km amount (minor units). */
export const perKmToPerMile = (cents: number) => Math.round(cents / 0.621371);
export const perMileToPerKm = (cents: number) => Math.round(cents * 0.621371);

/** 'YYYY-MM' to 'Jan'…'Dec', for chart axes. */
export function monthShort(m: string): string {
  return ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m.split('-')[1])] ?? m;
}
