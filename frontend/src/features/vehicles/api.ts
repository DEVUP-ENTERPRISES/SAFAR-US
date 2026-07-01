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

export const vehicleApi = {
  search: (params: SearchParams) =>
    api.get<Vehicle[]>(
      '/search/vehicles',
      params as unknown as Record<string, string | number | boolean | undefined>,
      false,
    ),
  getById: (id: string) => api.get<Vehicle>(`/vehicles/${id}`, undefined, false),
  myVehicles: () => api.get<Vehicle[]>('/vehicles/me/list'),
  create: (input: CreateVehicleInput) => api.post<Vehicle>('/vehicles', input),
  submit: (id: string) => api.post<Vehicle>(`/vehicles/${id}/submit`),
  updatePricing: (id: string, patch: Record<string, unknown>) =>
    api.raw<Vehicle>(`/vehicles/${id}/pricing`, { method: 'PUT', body: patch }).then((r) => r.data),
  addPhotos: (id: string, photos: { url: string; key?: string }[]) =>
    api.post<Vehicle>(`/vehicles/${id}/photos`, { photos }),
  verifyVin: (id: string, vin: string) => api.post<Vehicle>(`/vehicles/${id}/verify-vin`, { vin }),
  getCalendar: (id: string, from?: string, to?: string) =>
    api.get<CalendarEntry[]>(`/vehicles/${id}/availability`, { from, to }, false),
  setAvailability: (id: string, start: string, end: string, action: 'block' | 'unblock') =>
    api.raw<{ updated: boolean }>(`/vehicles/${id}/availability`, {
      method: 'PUT',
      body: { start, end, action },
    }).then((r) => r.data),
};
