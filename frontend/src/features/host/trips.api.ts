import { api } from '@/lib/api/client';

export interface HostTrip {
  bookingId: string;
  code: string;
  tripId?: string;
  status: string;
  period: { start: string; end: string };
  earnings: number;
  currency: string;
  pickupAddress?: string;
  isDelivery: boolean;
  delivery?: { mode: string; address: string; flightNumber?: string; terminal?: string; arrivesAt?: string };
  vehicle: { _id: string; make: string; model: string; year: number; plate?: string; photoUrl?: string };
  guest: { _id: string; name: string; avatarUrl?: string; joinedAt: string; tripCount: number };
  mileage: { includedKm: number; overageFeePerKm: number; drivenKm?: number };
  licenseConfirmed: boolean;
  photoCount: number;
}

export const hostTripsApi = {
  booked: () => api.get<HostTrip[]>('/trips/host/booked'),
  history: () => api.get<HostTrip[]>('/trips/host/history'),
  one: (bookingId: string) => api.get<HostTrip>(`/trips/host/booking/${bookingId}`),

  confirmLicense: (tripId: string) => api.post(`/trips/${tripId}/confirm-license`),
  handover: (tripId: string, body: { odometerStart: number; fuelStart?: number; notes?: string }) =>
    api.post(`/trips/${tripId}/handover`, body),
  addPhotos: (tripId: string, phase: 'pre' | 'post', photos: { url: string; key?: string }[]) =>
    api.post(`/trips/${tripId}/photos`, { phase, photos }),
  complete: (tripId: string, body: { odometerEnd?: number; fuelEnd?: number; notes?: string }) =>
    api.post(`/trips/${tripId}/complete`, body),
  reportDamage: (tripId: string, description: string, photos: string[]) =>
    api.post(`/trips/${tripId}/damage`, { description, photos }),
};
