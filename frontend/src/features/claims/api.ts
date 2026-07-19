import { api } from '@/lib/api/client';

export interface Claim {
  _id: string;
  type: string;
  description: string;
  status: string;
  evidence: { url: string; kind: string }[];
  amountClaimed?: number;
  createdAt: string;
  timeline: { status: string; at: string; note?: string }[];
}

export const claimsApi = {
  list: () => api.get<Claim[]>('/claims'),
  get: (id: string) => api.get<Claim>(`/claims/${id}`),
  create: (input: {
    type: 'damage' | 'insurance' | 'dispute';
    description: string;
    bookingId?: string;
    tripId?: string;
    amountClaimed?: number;
    evidence?: { url: string; kind: 'image' | 'file' }[];
  }) => api.post<Claim>('/claims', input),
};
