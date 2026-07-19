import { api } from '@/lib/api/client';

export interface Org { _id: string; name: string; billingEmail: string; domain?: string; status: string }
export interface Membership { _id: string; orgId: string; role: 'corp_admin' | 'manager' | 'employee'; email: string; status: string; costCenterId?: string }
export interface OrgContext { org: Org; membership: Membership }
export interface CostCenter { _id: string; name: string; code: string; budget: number; currency: string }
export interface Policy { maxDailyPrice: number; allowedCategories: string[]; autoApproveUnder: number; requireApprovalOver: number }
export interface TripRequest {
  _id: string; employeeEmail: string; vehicleId: string; costCenterId?: string;
  start: string; end: string; estimatedTotal: number; currency: string; reason?: string;
  policyFlags: string[]; status: 'pending' | 'approved' | 'rejected' | 'booked'; decisionNote?: string; bookingId?: string;
}
export interface CorpDashboard {
  org: Org; role: string; members: number; costCenters: number;
  pendingApprovals: number; totalTrips: number; totalSpend: number; currency: string;
}
export interface Invoice {
  lines: { bookingCode: string; date: string; costCenter: string; amount: number; status: string }[];
  byCostCenter: { costCenterId: string; name: string; amount: number }[];
  total: number; currency: string;
}

export const corporateApi = {
  me: () => api.get<OrgContext | null>('/corporate/me'),
  createOrg: (name: string, billingEmail: string, domain?: string) => api.post<Org>('/corporate/orgs', { name, billingEmail, domain }),
  dashboard: () => api.get<CorpDashboard>('/corporate/dashboard'),

  members: () => api.get<Membership[]>('/corporate/members'),
  invite: (email: string, role: string, costCenterId?: string) => api.post<Membership>('/corporate/members', { email, role, costCenterId }),
  removeMember: (id: string) => api.delete(`/corporate/members/${id}`),

  costCenters: () => api.get<CostCenter[]>('/corporate/cost-centers'),
  createCostCenter: (name: string, code: string, budget: number) => api.post<CostCenter>('/corporate/cost-centers', { name, code, budget }),

  policy: () => api.get<Policy>('/corporate/policy'),
  setPolicy: (patch: Partial<Policy>) => api.raw<Policy>('/corporate/policy', { method: 'PUT', body: patch }).then((r) => r.data),

  requests: (status?: string) => api.get<TripRequest[]>('/corporate/requests', status ? { status } : undefined),
  createRequest: (input: { vehicleId: string; start: string; end: string; costCenterId?: string; reason?: string }) => api.post<TripRequest>('/corporate/requests', input),
  decide: (id: string, decision: 'approved' | 'rejected', note?: string) => api.post<TripRequest>(`/corporate/requests/${id}/decision`, { decision, note }),
  book: (id: string) => api.post<TripRequest>(`/corporate/requests/${id}/book`),

  invoice: () => api.get<Invoice>('/corporate/invoice'),
};
