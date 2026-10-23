import { formatMoney, FUEL_LABEL } from '@/lib/utils/format';
import type { Vehicle } from './types';

export const MAX_COMPARE = 4;

/** Add or remove a car; a fourth pushes out the oldest. */
export function toggleCompare(cur: string[], id: string): string[] {
  if (cur.includes(id)) return cur.filter((x) => x !== id);
  if (cur.length >= MAX_COMPARE) return [...cur.slice(1), id];
  return [...cur, id];
}

export type CompareValue = { text: string; muted?: boolean; strong?: boolean; capitalize?: boolean } | { rating: number; count: number } | { yes: boolean } | { tags: string[]; more: number };

/** The comparison rows, as data each surface renders its own way. */
export const COMPARE_ROWS: { label: string; get: (v: Vehicle) => CompareValue }[] = [
  { label: 'Price / day', get: (v) => ({ text: formatMoney({ amount: v.pricing.dailyPrice, currency: v.pricing.currency }), strong: true }) },
  { label: 'Rating', get: (v) => (v.ratingCount ? { rating: v.ratingAvg, count: v.ratingCount } : { text: 'New', muted: true }) },
  { label: 'Category', get: (v) => (v.category === 'suv' ? { text: 'SUV' } : { text: v.category, capitalize: true }) },
  { label: 'Year', get: (v) => ({ text: String(v.year) }) },
  { label: 'Seats', get: (v) => ({ text: `${v.seats} seats` }) },
  { label: 'Transmission', get: (v) => ({ text: v.transmission, capitalize: true }) },
  { label: 'Fuel', get: (v) => ({ text: FUEL_LABEL[v.fuelType] }) },
  { label: 'Instant book', get: (v) => ({ yes: !!v.listing.instantBook }) },
  {
    label: 'Delivery',
    get: (v) => {
      const d = v.listing.delivery;
      return { yes: !!(d && (d.airport || d.home || d.hotel || d.business)) };
    },
  },
  { label: 'City', get: (v) => ({ text: v.location.city || '—' }) },
  { label: 'Features', get: (v) => ({ tags: (v.features ?? []).slice(0, 6), more: Math.max(0, (v.features ?? []).length - 6) }) },
];
