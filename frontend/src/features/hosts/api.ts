import { api } from '@/lib/api/client';

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
  onboard: (displayName: string, bio?: string) =>
    api.post<Host>('/hosts/onboard', { displayName, bio }),
};
