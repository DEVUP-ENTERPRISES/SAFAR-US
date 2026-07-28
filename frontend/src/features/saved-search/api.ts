import { api } from '@/lib/api/client';

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
