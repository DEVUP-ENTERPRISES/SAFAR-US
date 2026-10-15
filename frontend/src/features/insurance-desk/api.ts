import { api } from '@/lib/api/client';
import type { Insurer, InsurerPayout, InsurerPlan, InsurerSummary } from '@/features/insurers/api';

type Q = Record<string, string | number | boolean | undefined>;

export interface WheelbaseListingRow {
  id: number;
  name: string;
  year?: number;
  make?: string;
  model?: string;
  insuranceState?: string;
  coverage?: string;
  eligible?: boolean;
  planLabel?: string;
  minRenterAge?: number;
}

export interface WheelbaseCarLink {
  rentalId: number;
  name: string;
  linkedBy: 'auto' | 'admin';
  insuranceState?: string;
  coverage?: string;
  planLabel?: string;
  minRenterAge?: number;
  found: boolean;
  syncedAt: string;
}

export interface WheelbaseOverview {
  dealerId: string;
  error?: string;
  listings: WheelbaseListingRow[];
  cars: { _id: string; name: string; plate?: string; status: string; photoUrl?: string; wheelbase: WheelbaseCarLink | null; suggestions: number[] }[];
}

export type WheelbaseSyncResult =
  | { listings: number; updated: number; autoLinked: number; unmatched: number; missing: number }
  | { skipped: 'no_dealer' };

// The insurance desk API: insurer partners and fleet insurance, outside the admin console.
export interface InsuranceSettings {
  wheelbaseDealerId: string;
  requireApproved: boolean;
  enforceMinAge: boolean;
  partnerCommissionBps: number;
}

export const deskApi = {
  settings: () => api.get<InsuranceSettings>('/insurance-desk/settings'),
  saveSettings: (patch: Partial<InsuranceSettings> & { reason?: string }) =>
    api.raw<InsuranceSettings>('/insurance-desk/settings', { method: 'PUT', body: patch }).then((r) => r.data),
  insurers: (q: Q = {}) => api.get<Insurer[]>('/insurance-desk/insurance-partners', q),
  insurer: (id: string) =>
    api.get<{ insurer: Insurer; plans: InsurerPlan[]; summary: InsurerSummary; payouts: InsurerPayout[]; commissionBps: number }>(`/insurance-desk/insurance-partners/${id}`),
  reviewInsurer: (id: string, decision: 'approved' | 'rejected', notes?: string) => api.post(`/insurance-desk/insurance-partners/${id}/review`, { decision, notes }),
  setInsurerStatus: (id: string, status: 'approved' | 'suspended', reason?: string) => api.post(`/insurance-desk/insurance-partners/${id}/status`, { status, reason }),
  setInsurerCommission: (id: string, commissionBps: number | null) => api.patch(`/insurance-desk/insurance-partners/${id}/commission`, { commissionBps }),
  recordInsurerPayout: (id: string, input: { amount: number; reference: string; note?: string }) => api.post(`/insurance-desk/insurance-partners/${id}/payouts`, input),
  wheelbaseOverview: () => api.get<WheelbaseOverview>('/insurance-desk/insurance/wheelbase'),
  wheelbaseSync: () => api.post<WheelbaseSyncResult>('/insurance-desk/insurance/wheelbase/sync'),
  wheelbaseLink: (vehicleId: string, rentalId: number | null) =>
    api.patch<{ ok: true }>(`/insurance-desk/insurance/wheelbase/vehicles/${vehicleId}`, { rentalId }),
};
