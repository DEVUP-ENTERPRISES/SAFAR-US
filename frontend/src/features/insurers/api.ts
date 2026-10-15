import { api } from '@/lib/api/client';

export type InsurerStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface Insurer {
  _id: string;
  userId: string;
  status: InsurerStatus;
  legalName: string;
  displayName: string;
  licenceNumber: string;
  licensedStates: string[];
  contactName: string;
  email: string;
  phone?: string;
  website?: string;
  licenceDoc?: { url: string; key?: string };
  commissionBps?: number;
  payoutDetails?: { accountHolder?: string; bankName?: string; routingNumber?: string; accountLast4?: string };
  reviewNotes?: string;
  reviewedAt?: string;
  approvedAt?: string;
  suspendedReason?: string;
  createdAt: string;
}

export interface InsurerApplicationInput {
  legalName: string;
  displayName: string;
  licenceNumber: string;
  licensedStates: string[];
  contactName: string;
  email: string;
  phone?: string;
  website?: string;
  licenceDoc?: { url: string; key?: string };
}

export interface InsurerPlan {
  _id: string;
  insurerId: string;
  name: string;
  description: string;
  pricePerDay: number;
  deductibleCents: number;
  liabilityLimitCents: number;
  coverage: string[];
  states: string[];
  categories: string[];
  active: boolean;
  sortOrder: number;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  reviewNote?: string;
}

export type InsurerPlanInput = Omit<InsurerPlan, '_id' | 'insurerId' | 'sortOrder' | 'reviewStatus' | 'reviewNote'> & { sortOrder?: number };

/** What a plan's CatoDrive review means to the company and to staff. */
export const PLAN_REVIEW: Record<InsurerPlan['reviewStatus'], { label: string; tone: 'warning' | 'success' | 'destructive' }> = {
  pending: { label: 'Waiting for CatoDrive', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Needs changes', tone: 'destructive' },
};

export interface InsurerSummary {
  balance: number;
  earned: number;
  paidOut: number;
  policies: number;
  byMonth: { month: string; amount: number }[];
  currency: string;
}

export interface InsurerPolicy {
  bookingId: string;
  code: string;
  status: string;
  start: string;
  end: string;
  plan: string;
  premium: number;
  currency: string;
  vehicle: { year?: number; make?: string; model?: string; state?: string } | null;
}

export interface InsurerPayout {
  _id: string;
  amount: number;
  currency: string;
  reference: string;
  note?: string;
  paidAt: string;
}

export const insurerApi = {
  me: () => api.get<{ insurer: Insurer; commissionBps: number } | null>('/insurance-partners/me'),
  apply: (input: InsurerApplicationInput) => api.post<Insurer>('/insurance-partners/apply', input),
  updateProfile: (patch: Partial<Pick<Insurer, 'displayName' | 'contactName' | 'email' | 'phone' | 'website'>>) => api.patch<Insurer>('/insurance-partners/me', patch),
  setPayoutDetails: (d: { accountHolder: string; bankName: string; routingNumber: string; accountNumber: string }) =>
    api.raw<Insurer>('/insurance-partners/me/payout-details', { method: 'PUT', body: d }).then((r) => r.data),
  summary: () => api.get<InsurerSummary>('/insurance-partners/me/summary'),
  policies: (q: { limit?: number; skip?: number } = {}) => api.get<InsurerPolicy[]>('/insurance-partners/me/policies', q),
  payouts: () => api.get<InsurerPayout[]>('/insurance-partners/me/payouts'),
  plans: () => api.get<InsurerPlan[]>('/insurance-partners/me/plans'),
  createPlan: (input: InsurerPlanInput) => api.post<InsurerPlan>('/insurance-partners/me/plans', input),
  updatePlan: (id: string, input: InsurerPlanInput) => api.raw<InsurerPlan>(`/insurance-partners/me/plans/${id}`, { method: 'PUT', body: input }).then((r) => r.data),
};

export const INSURER_STATUS: Record<InsurerStatus, { label: string; tone: 'warning' | 'success' | 'destructive' | 'muted' }> = {
  pending: { label: 'In review', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Not approved', tone: 'destructive' },
  suspended: { label: 'Suspended', tone: 'destructive' },
};

/** Car categories a plan can be limited to; matches the listing categories. */
export const PLAN_CATEGORIES = ['economy', 'luxury', 'suv', 'van', 'sports', 'ev'];
