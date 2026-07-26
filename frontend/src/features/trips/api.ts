import { api } from '@/lib/api/client';

export interface Trip {
  _id: string;
  bookingId: string;
  vehicleId: string;
  guestId: string;
  hostId: string;
  status: 'active' | 'completed' | 'disputed';
  checkin?: { at: string; method: string };
  handover: { at: string; odometerStart?: number; fuelStart?: number };
  return?: { at: string; odometerEnd?: number; fuelEnd?: number };
  liveLocation?: { coordinates: [number, number]; updatedAt: string };
  /** Condition photos. `pre` = pickup, `post` = return — the damage baseline. */
  photos?: { url: string; key?: string; phase: 'pre' | 'post'; byUserId: string; at: string }[];
  damageReports: { description: string; photos: string[]; at: string }[];
  distanceKm: number;
  carbon?: {
    distanceKm: number;
    fuelType: string;
    emittedKg: number;
    baselineKg: number;
    savedKg: number;
    treesEquivalent: number;
  } | null;
}

export const tripApi = {
  get: (id: string) => api.get<Trip>(`/trips/${id}`),
  start: (bookingId: string, odometerStart?: number, fuelStart?: number) =>
    api.post<Trip>('/trips/start', { bookingId, odometerStart, fuelStart }),
  checkIn: (id: string, method: 'contactless' | 'in_person') =>
    api.post<Trip>(`/trips/${id}/checkin`, { method }),
  complete: (id: string, odometerEnd?: number, fuelEnd?: number) =>
    api.post<Trip>(`/trips/${id}/complete`, { odometerEnd, fuelEnd }),
  addPhotos: (id: string, phase: 'pre' | 'post', photos: { url: string; key?: string }[]) =>
    api.post<Trip>(`/trips/${id}/photos`, { phase, photos }),
  reportDamage: (id: string, description: string, photos: string[]) =>
    api.post<Trip>(`/trips/${id}/damage`, { description, photos }),
  sos: (id: string) => api.post<{ alerted: boolean }>(`/trips/${id}/sos`),
};
