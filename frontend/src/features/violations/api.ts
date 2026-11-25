import { api } from '@/lib/api/client';

/** A ticket or toll from one of the guest's trips, charged at cost. */
export interface Violation {
  _id: string;
  bookingId: string;
  citationRef: string;
  issuedBy: string;
  type: string;
  description?: string;
  amount: number;
  currency: string;
  occurredAt: string;
  status: 'reported' | 'charged' | 'charge_failed' | 'disputed' | 'waived' | 'resolved';
  evidence?: { kind: 'image' | 'file'; note?: string }[];
  createdAt: string;
}

export const violationsApi = {
  mine: () => api.get<Violation[]>('/violations/me'),
  /** "This is not mine": holds the charge until support reviews it. */
  dispute: (id: string, reason: string) => api.post(`/violations/${id}/dispute`, { reason }),
  /** A short-lived link to the notice itself; the file is private, so it is never a lasting URL. */
  evidence: (id: string, index = 0) => api.get<{ url: string }>(`/violations/${id}/evidence/${index}`),
};
