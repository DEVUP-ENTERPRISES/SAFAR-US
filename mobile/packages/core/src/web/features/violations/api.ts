// Generated from frontend/src/features/violations/api.ts by mobile/tools/sync-web.js. Edit the web file, then run `npm run sync:api`.
import { api } from '../../lib/api/client';

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
  status: 'reported' | 'charged' | 'disputed' | 'waived' | 'resolved';
  evidenceUrl?: string;
  createdAt: string;
}

export const violationsApi = {
  mine: () => api.get<Violation[]>('/violations/me'),
  /** "This is not mine": holds the charge until support reviews it. */
  dispute: (id: string, reason: string) => api.post(`/violations/${id}/dispute`, { reason }),
};
