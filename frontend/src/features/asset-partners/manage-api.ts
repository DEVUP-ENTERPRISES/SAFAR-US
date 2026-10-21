import { api } from '@/lib/api/client';
import type { FuelLevel, IntakeReport } from './api';

type Q = Record<string, string | number | boolean | undefined>;
export type ReviewDecision = 'approved' | 'changes_requested' | 'rejected';

export interface ProgrammeSummary {
  applications: Partial<Record<'submitted' | 'under_review' | 'changes_requested' | 'approved' | 'rejected', number>>;
  partners: Partial<Record<'onboarding' | 'active' | 'suspended' | 'exited', number>>;
  vehicles: number;
}

export type AgreementKind = 'agreement' | 'nda';

export interface PayoutRow {
  partnerId: string;
  displayName: string;
  status: string;
  net: number;
  trips: number;
  cars: number;
  method: 'zelle' | 'check';
  sendTo?: string;
  dueDate: string;
  paid?: { _id: string; amount: number; method: string; reference: string; paidAt: string; note?: string };
}

export interface IntakeInput {
  applicationId?: string;
  vehicleId?: string;
  vehicle: { year: string; make: string; model: string; trim?: string; color?: string; vin: string; plate: string };
  odometer: number;
  estimatedMarketValue?: string;
  listingUrl?: string;
  intakeDate: string;
  location: string;
  fuelLevel: FuelLevel;
  preExistingDamage: string;
  conditionNotes?: string;
  photos?: { url: string; key?: string; label?: string }[];
  signedName: string;
  signedTitle: string;
}

export interface AgreementVersion {
  _id: string;
  kind?: AgreementKind;
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
    placeholders: () => api.get<{ key: string; label: string }[]>(`${base}/asset-partner-agreements/placeholders`),
    publishAgreement: (input: { kind: AgreementKind; title: string; body: string }) => api.post<AgreementVersion>(`${base}/asset-partner-agreements`, input),
    signedCopy: (id: string, kind: AgreementKind) => api.download(`${base}/asset-partners/${id}/signed/${kind}`),
    partnerDocuments: (id: string) => api.get<{ checklist: { category: string; label: string; hint: string; uploaded: boolean; status?: string }[]; documents: { _id: string; category: string; createdAt: string; verification?: { status: string; reason?: string } }[] }>(`${base}/asset-partners/${id}/documents`),
    viewDocument: (id: string, docId: string) => api.get<{ url: string }>(`${base}/asset-partners/${id}/documents/${docId}/view`),
    reviewDocument: (id: string, docId: string, decision: 'verified' | 'rejected', reason?: string) => api.post(`${base}/asset-partners/${id}/documents/${docId}/review`, { decision, reason }),
    createListing: (applicationId: string, input: { address?: string; transmission?: string; fuelType?: string; seats?: number; bodyType?: string }) =>
      api.post<{ vehicleId: string; created: boolean }>(`${base}/asset-partner-applications/${applicationId}/listing`, input),
    payouts: (period: string) => api.get<{ period: string; rows: PayoutRow[]; totals: { due: number; paid: number; unpaid: number } }>(`${base}/asset-partner-payouts`, { period }),
    recordPayout: (input: { partnerId: string; period: string; amount: number; method: 'zelle' | 'check'; reference: string; note?: string; paidAt?: string }) =>
      api.post(`${base}/asset-partner-payouts`, input),
    removePayout: (payoutId: string) => api.delete(`${base}/asset-partner-payouts/${payoutId}`),
    intakes: (id: string) => api.get<IntakeReport[]>(`${base}/asset-partners/${id}/intakes`),
    intakeDraft: (id: string, applicationId?: string) => api.get<Partial<IntakeInput>>(`${base}/asset-partners/${id}/intakes/draft`, applicationId ? { applicationId } : {}),
    createIntake: (id: string, input: IntakeInput) => api.post<IntakeReport>(`${base}/asset-partners/${id}/intakes`, input),
    intakePdf: (id: string, intakeId: string) => api.download(`${base}/asset-partners/${id}/intakes/${intakeId}/pdf`),
  };
}
