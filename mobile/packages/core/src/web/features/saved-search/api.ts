// Generated from frontend/src/features/saved-search/api.ts by mobile/tools/sync-web.js. Edit the web file, then run `npm run sync:api`.
import { api } from '../../lib/api/client';
import { FUEL_LABEL } from '../../lib/utils/format';

export interface SavedSearch {
  _id: string;
  label: string;
  criteria: {
    city?: string;
    category?: string;
    fuelType?: string;
    transmission?: string;
    seatsMin?: number;
    priceMaxCents?: number;
    instantBook?: boolean;
  };
  alertsEnabled: boolean;
  createdAt: string;
}

export interface CreateSavedSearch {
  label?: string;
  city?: string;
  category?: string;
  fuelType?: 'petrol' | 'diesel' | 'hybrid' | 'ev';
  transmission?: 'manual' | 'automatic';
  seatsMin?: number;
  priceMaxCents?: number;
  instantBook?: boolean;
}

export const savedSearchApi = {
  list: () => api.get<SavedSearch[]>('/saved-searches'),
  create: (input: CreateSavedSearch) => api.post<SavedSearch>('/saved-searches', input),
  setAlerts: (id: string, enabled: boolean) =>
    api.patch<SavedSearch>(`/saved-searches/${id}/alerts`, { enabled }),
  remove: (id: string) =>
    api.raw<{ removed: boolean }>(`/saved-searches/${id}`, { method: 'DELETE' }).then((r) => r.data),
};

/** One line describing what a saved search looks for. */
export function summariseSearch(c: SavedSearch['criteria']): string {
  const bits: string[] = [];
  if (c.category) bits.push(c.category);
  if (c.fuelType) bits.push(FUEL_LABEL[c.fuelType as keyof typeof FUEL_LABEL] ?? c.fuelType);
  if (c.transmission) bits.push(c.transmission);
  if (c.seatsMin) bits.push(`${c.seatsMin}+ seats`);
  if (c.instantBook) bits.push('Instant Book');
  if (c.priceMaxCents) bits.push(`≤ $${Math.round(c.priceMaxCents / 100)}/day`);
  return bits.join(' · ') || 'Any car';
}

/** The search a saved search reruns (city and type, like the website's link). */
export function searchParamsOf(c: SavedSearch['criteria']): { city?: string; category?: string } {
  return { ...(c.city ? { city: c.city } : {}), ...(c.category ? { category: c.category } : {}) };
}
