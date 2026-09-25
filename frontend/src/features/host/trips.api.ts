import { api } from '@/lib/api/client';

export interface HostTrip {
  bookingId: string;
  code: string;
  tripId?: string;
  status: string;
  period: { start: string; end: string };
  earnings: number;
  currency: string;
  receipt: {
    issuedAt: string;
    days: number;
    base: number;
    cleaningFee: number;
    delivery: number;
    protection: number;
    protectionPlan?: string;
    discount: number;
    subtotal: number;
    commission: number;
    tax: number;
    hostEarnings: number;
    total: number;
  };
  extensions: { _id: string; days: number; prevEnd: string; newEnd: string; hostEarnings: number; createdAt: string }[];
  pickupAddress?: string;
  isDelivery: boolean;
  delivery?: { mode: string; address: string; flightNumber?: string; terminal?: string; arrivesAt?: string };
  vehicle: { _id: string; make: string; model: string; year: number; plate?: string; photoUrl?: string };
  guest: {
    _id: string;
    name: string;
    avatarUrl?: string;
    joinedAt: string;
    tripCount: number;
    /** Absent when talking to a backend that predates identity details. */
    verification?: {
      verified: boolean;
      verifiedName?: string;
      age?: number;
      licenceExpiry?: string;
      verifiedAt?: string;
      licenceValidThroughTrip: boolean | null;
    };
  };
  mileage: { includedKm: number; overageFeePerKm: number; drivenKm?: number };
  licenseConfirmed: boolean;
  pickupVerified: boolean;
  returnAwaitingConfirmation?: boolean;
  photoCount: number;
  /** Absent on a backend that predates the ordered handover. */
  timeline?: TimelineStep[];
  handover?: HostHandover;
}

export interface TimelineStep {
  key: string;
  label: string;
  state: 'done' | 'current' | 'todo' | 'locked';
  detail?: string;
}

export interface HostHandover {
  inspection: { taken: number; required: number; open: boolean; opensAt: string | null };
  guestVerified: boolean;
  licenceValidThroughTrip: boolean | null;
  licenceConfirmed: boolean;
  pickupVerified: boolean;
  codeLocked: boolean;
  requirements: { hostInspectionRequired: boolean; pickupCodeRequired: boolean; hostOnlyStart: boolean };
}

export const hostTripsApi = {
  booked: () => api.get<HostTrip[]>('/trips/host/booked'),
  history: () => api.get<HostTrip[]>('/trips/host/history'),
  one: (bookingId: string) => api.get<HostTrip>(`/trips/host/booking/${bookingId}`),

  confirmLicense: (tripId: string) => api.post(`/trips/${tripId}/confirm-license`),
  /** Creates the trip — there is no trip to hand over to before this runs. */
  start: (bookingId: string, body: { odometerStart: number; fuelStart?: number; notes?: string; licenceConfirmed?: boolean }) =>
    api.post<{ _id: string }>('/trips/start', { bookingId, ...body }),
  complete: (tripId: string, body: { odometerEnd?: number; fuelEnd?: number; notes?: string }) =>
    api.post(`/trips/${tripId}/complete`, body),
  confirmReturn: (tripId: string, body: { odometerEnd?: number; fuelEnd?: number }) =>
    api.post(`/trips/${tripId}/confirm-return`, body),
  reportDamage: (tripId: string, description: string, photos: string[]) =>
    api.post(`/trips/${tripId}/damage`, { description, photos }),
};
