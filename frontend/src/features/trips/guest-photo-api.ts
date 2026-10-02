import { api } from '@/lib/api/client';

export interface GuestPhotoStatus {
  open: boolean;
  opensAt: string;
  started: boolean;
  viewSeconds: number;
  verified: boolean;
  verifiedName?: string;
  age?: number;
  photoAvailable: boolean;
  check: { result: 'match' | 'mismatch'; at: string } | null;
}

export interface TimedView {
  token: string;
  expiresAt: string;
  viewSeconds: number;
  items: { id: string; label: string }[];
}

export type StampedFile = { contentType: 'image/jpeg' | 'application/pdf'; data: string };

const base = (bookingId: string) => `/trips/booking/${bookingId}/guest-photo`;

/** The host's view of the guest's verified selfie, shortly before pickup. */
export const guestPhotoApi = {
  status: (bookingId: string) => api.get<GuestPhotoStatus>(base(bookingId)),
  open: (bookingId: string) => api.post<TimedView>(`${base(bookingId)}/open`),
  file: (bookingId: string, token: string) => api.post<StampedFile>(`${base(bookingId)}/file`, { token }),
  check: (bookingId: string, result: 'match' | 'mismatch', note?: string) =>
    api.post<{ result: 'match' | 'mismatch'; at: string }>(`${base(bookingId)}/check`, { result, note }),
};
