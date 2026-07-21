import { api } from '@/lib/api/client';
import type { SearchParams, Vehicle } from './types';

export interface CreateVehicleInput {
  make: string;
  model: string;
  year: number;
  bodyType: string;
  category: string;
  transmission: 'manual' | 'automatic';
  fuelType: 'petrol' | 'diesel' | 'hybrid' | 'ev';
  seats: number;
  vin?: string;
  registrationNumber?: string;
  specs?: { doors?: number; color?: string; mileageKm?: number };
  features: string[];
  photos: { url: string; key?: string; isCover?: boolean }[];
  addOns?: { code: string; label: string; priceType: 'per_trip' | 'per_day'; amount: number }[];
  tripRules?: string[];
  mileageLimit?: { perDayKm: number; overageFeePerKm: number };
  location: { lng: number; lat: number; address: string; city: string };
  listing: {
    title: string;
    description: string;
    instantBook: boolean;
    minTripHours: number;
    maxTripHours: number;
    cancellationPolicy: 'flexible' | 'moderate' | 'strict';
    delivery: { airport: boolean; home: boolean; hotel: boolean; business: boolean; radiusKm: number; fee: number };
  };
  pricing: {
    dailyPrice: number;
    currency: string;
    cleaningFee: number;
    weekendMultiplierBps: number;
    weeklyDiscountBps: number;
    monthlyDiscountBps: number;
    earlyBirdBps: number;
    lastMinuteBps: number;
    dynamicPricing: boolean;
  };
}

export interface CalendarEntry {
  dayKey: string;
  state: string;
  bookingId?: string;
}

export interface CityFacet {
  city: string; vehicles: number; lng: number; lat: number; fromPrice: number;
}
export interface CategoryFacet {
  category: string; vehicles: number; fromPrice: number;
}
export interface MarketplaceFacets {
  currency: string;
  cities: CityFacet[];
  categories: CategoryFacet[];
  stats: {
    vehicles: number; verifiedHosts: number;
    ratingAvg: number | null; ratingCount: number; instantBook: number;
  };
}

export const vehicleApi = {
  /** Real cities/categories/trust numbers — nothing about supply is hardcoded. */
  facets: (city?: string) =>
    api.get<MarketplaceFacets>('/search/facets', city ? { city } : undefined, false),
  search: (params: SearchParams) =>
    api.get<Vehicle[]>(
      '/search/vehicles',
      params as unknown as Record<string, string | number | boolean | undefined>,
      false,
    ),
  recommendations: (limit = 12) =>
    api.get<Vehicle[]>('/search/recommendations', { limit }),
  getById: (id: string) => api.get<Vehicle>(`/vehicles/${id}`, undefined, false),
  myVehicles: () => api.get<Vehicle[]>('/vehicles/me/list'),
  create: (input: CreateVehicleInput) => api.post<Vehicle>('/vehicles', input),
  submit: (id: string) => api.post<Vehicle>(`/vehicles/${id}/submit`),
  updatePricing: (id: string, patch: Record<string, unknown>) =>
    api.raw<Vehicle>(`/vehicles/${id}/pricing`, { method: 'PUT', body: patch }).then((r) => r.data),
  addPhotos: (id: string, photos: { url: string; key?: string }[]) =>
    api.post<Vehicle>(`/vehicles/${id}/photos`, { photos }),
  removePhoto: (id: string, key: string) =>
    api.raw<Vehicle>(`/vehicles/${id}/photos`, { method: 'DELETE', body: { key } }).then((r) => r.data),
  setCoverPhoto: (id: string, key: string) =>
    api.raw<Vehicle>(`/vehicles/${id}/photos/cover`, { method: 'PUT', body: { key } }).then((r) => r.data),
  update: (id: string, patch: Record<string, unknown>) =>
    api.raw<Vehicle>(`/vehicles/${id}`, { method: 'PATCH', body: patch }).then((r) => r.data),
  delist: (id: string) =>
    api.raw<{ delisted: boolean }>(`/vehicles/${id}`, { method: 'DELETE' }).then((r) => r.data),
  requirements: () => api.get<{ minPhotos: number }>('/vehicles/requirements', undefined, false),
  verifyVin: (id: string, vin: string) => api.post<Vehicle>(`/vehicles/${id}/verify-vin`, { vin }),
  priceSuggestion: (p: { lng: number; lat: number; category: string; fuelType?: string }) =>
    api.get<{ suggested: number; median: number; p25: number; p75: number; sampleSize: number; demand: string; currency: string }>(
      '/vehicles/price-suggestion',
      p as unknown as Record<string, string | number | boolean | undefined>,
    ),
  getCalendar: (id: string, from?: string, to?: string) =>
    api.get<CalendarEntry[]>(`/vehicles/${id}/availability`, { from, to }, false),
  setAvailability: (id: string, start: string, end: string, action: 'block' | 'unblock') =>
    api.raw<{ updated: boolean }>(`/vehicles/${id}/availability`, {
      method: 'PUT',
      body: { start, end, action },
    }).then((r) => r.data),
};
