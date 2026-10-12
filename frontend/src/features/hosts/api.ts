import { api } from '@/lib/api/client';
import type { Vehicle } from '@/features/vehicles/types';

export interface Host {
  _id: string;
  userId: string;
  displayName: string;
  verificationStatus: string;
  ratingAvg: number;
  totalTrips: number;
}

export const hostApi = {
  me: () => api.get<Host>('/hosts/me'),
  /** A host's listed cars, for their public page. */
  publicVehicles: (hostId: string) => api.get<Vehicle[]>(`/hosts/${hostId}/vehicles`, undefined, false),
  onboard: (displayName: string, bio?: string) =>
    api.post<Host>('/hosts/onboard', { displayName, bio }),
};
