import { api } from '@/lib/api/client';

type Q = Record<string, string | number | boolean | undefined>;
export type ReviewDecision = 'approved' | 'changes_requested' | 'rejected';

export interface ProgrammeSummary {
  applications: Partial<Record<'submitted' | 'under_review' | 'changes_requested' | 'approved' | 'rejected', number>>;
  partners: Partial<Record<'onboarding' | 'active' | 'suspended' | 'exited', number>>;
  vehicles: number;
}

export interface AgreementVersion {
  _id: string;
  version: number;
  title: string;
  body: string;
  createdAt: string;
}

/** Managing the Asset Partner programme; the operations panel calls it under /ioc, the admin console under /admin. */
export function partnerManageApi(base: '/ioc' | '/admin') {
  return {
    summary: () => api.get<ProgrammeSummary>(`${base}/asset-partners/summary`),
    applications: (q: Q = {}) => api.get<any[]>(`${base}/asset-partner-applications`, q),
    application: (id: string) => api.get<any>(`${base}/asset-partner-applications/${id}`),
    reviewApplication: (id: string, decision: ReviewDecision, notes?: string) =>
      api.post(`${base}/asset-partner-applications/${id}/review`, { decision, notes }),
    partners: (q: Q = {}) => api.get<any[]>(`${base}/asset-partners`, q),
    addPartner: (input: { email: string; fullName: string; businessName?: string; phone?: string; partnerType: 'individual' | 'business' | 'fleet'; notify?: boolean }) =>
      api.post<{ partner: { _id: string; displayName: string }; alreadyExisted: boolean; accountCreated: boolean }>(`${base}/asset-partners`, input),
    partner: (id: string) => api.get<any>(`${base}/asset-partners/${id}`),
    statement: (id: string, period?: string) => api.get<any>(`${base}/asset-partners/${id}/statement`, period ? { period } : {}),
    setStatus: (id: string, status: string, reason?: string) => api.post(`${base}/asset-partners/${id}/status`, { status, reason }),
    setTerms: (id: string, terms: Record<string, number | string | undefined>) => api.patch(`${base}/asset-partners/${id}/terms`, terms),
    agreements: () => api.get<AgreementVersion[]>(`${base}/asset-partner-agreements`),
    publishAgreement: (input: { title: string; body: string }) => api.post<AgreementVersion>(`${base}/asset-partner-agreements`, input),
  };
}
