import { api } from '@/lib/api/client';
import type { FuelLevel, IntakeReport, NoticeStatus, PartnerNotice, SignatureEnvelope } from './api';

type Q = Record<string, string | number | boolean | undefined>;
export type ReviewDecision = 'approved' | 'changes_requested' | 'rejected';

export interface FeeReportRow {
  partnerId: string;
  name: string;
  status: 'paid' | 'due' | 'waived' | 'refunded' | 'none';
  totalCents: number;
  platformFeeCents: number;
  paidCents?: number;
  setAt?: string;
  paidAt?: string;
  refundedAt?: string;
}

export interface FeeReport {
  currency: string;
  collectedCents: number;
  platformFeeCents: number;
  refundedCents: number;
  dueCents: number;
  paidCount: number;
  dueCount: number;
  waivedCount: number;
  refundedCount: number;
  rows: FeeReportRow[];
}

export interface ProgrammeSummary {
  applications: Partial<Record<'submitted' | 'under_review' | 'changes_requested' | 'approved' | 'rejected', number>>;
  partners: Partial<Record<'onboarding' | 'active' | 'suspended' | 'exited', number>>;
  vehicles: number;
}

export type AgreementKind = 'agreement' | 'nda' | 'amendment';

/** One version of a partner's terms; amounts in cents, fee in basis points. */
export interface TermsVersion {
  _id: string;
  terms: { managementFeeBps: number; insuranceMonthlyCents: number; detailingMonthlyCents: number; deductibleCapCents: number; maintenanceApprovalCents: number; payoutDayOfMonth: number };
  effectiveFrom: string;
  requestedFrom: string;
  status: 'pending_signature' | 'active' | 'cancelled' | 'declined';
  kind: 'baseline' | 'amendment';
  envelopeId?: string;
  reason?: string;
  createdAt: string;
  activatedAt?: string;
}

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

export interface CarMonth { trips: number; gross: number; managementFee: number; insurance: number; detailing: number; net: number }

export interface PortfolioCar {
  vehicleId: string;
  label: string;
  plate?: string;
  photo?: string;
  status: string;
  dailyPrice: number;
  partnerId: string;
  partnerName: string;
  partnerStatus: string;
  managementFeeBps: number;
  since?: string;
  endedAt?: string;
  pendingRepairs: number;
  month?: CarMonth;
}

export interface PortfolioOverview {
  period: string;
  cars: { inProgramme: number; listed: number; returned: number };
  partners: { active: number; onboarding: number };
  month: { trips: number; gross: number; managementFee: number; insurance: number; detailing: number; partnerNet: number };
  todo: { repairsAwaitingPartner: number; intakesAwaitingPartner: number; unpaidLastMonth: number; lastMonth: string };
}

export type RepairApproval = 'not_required' | 'pending' | 'approved' | 'declined';
export type RepairType = 'service' | 'repair' | 'inspection' | 'cleaning';

export interface PartnerRepair {
  _id: string;
  vehicleId: string;
  vehicleLabel: string;
  partnerName: string;
  assetPartnerId: string;
  type: RepairType;
  scheduledFor: string;
  cost?: number;
  notes?: string;
  status: 'scheduled' | 'in_progress' | 'completed';
  approval: RepairApproval;
  approvalThresholdCents?: number;
  approvedAt?: string;
  declineReason?: string;
}

/** Managing the Asset Partner programme; the operations panel calls it under /ioc, the admin console under /admin. */
export interface AddCarResult {
  vin: string;
  status: 'added' | 'already' | 'failed';
  vehicleId?: string;
  reason?: string;
}

export function partnerManageApi(base: '/ioc' | '/admin') {
  return {
    summary: () => api.get<ProgrammeSummary>(`${base}/asset-partners/summary`),
    applications: (q: Q = {}) => api.get<any[]>(`${base}/asset-partner-applications`, q),
    application: (id: string) => api.get<any>(`${base}/asset-partner-applications/${id}`),
    reviewApplication: (id: string, decision: ReviewDecision, notes?: string, rejection?: { reasons: string[]; improvements?: string; reapplyAfterDays?: number }, joiningFeeCents?: number, changes?: { key: string; note?: string }[]) =>
      api.post(`${base}/asset-partner-applications/${id}/review`, { decision, notes, rejection, joiningFeeCents, changes }),
    /** The items ops can send back for correction, with their plain names. */
    changeItems: () => api.get<{ key: string; label: string }[]>(`${base}/asset-partner-applications/change-items`),
    /** Whether registration fees are on, and the platform fee added to each. */
    joiningFeeSettings: () => api.get<{ enabled: boolean; platformFeeCents: number }>(`${base}/asset-partner-fee/default`),
    feeReport: () => api.get<FeeReport>(`${base}/asset-partner-fees`),
    setJoiningFee: (partnerId: string, amountCents: number) => api.patch(`${base}/asset-partners/${partnerId}/joining-fee`, { amountCents }),
    refundJoiningFee: (partnerId: string, reason: string) => api.post(`${base}/asset-partners/${partnerId}/joining-fee/refund`, { reason }),
    rejectionReasons: () => api.get<{ code: string; label: string; why: string; improve: string }[]>(`${base}/asset-partner-applications/rejection-reasons`),
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
    envelopes: (id: string) => api.get<SignatureEnvelope[]>(`${base}/asset-partners/${id}/envelopes`),
    sealedDocument: (documentId: string) => api.download(`${base}/signed-documents/${documentId}`),
    resendCopy: (id: string, envelopeId: string) => api.post<{ sent: boolean }>(`${base}/asset-partners/${id}/envelopes/${envelopeId}/resend`),
    termsHistory: (id: string) => api.get<{ history: TermsVersion[]; pending: TermsVersion | null }>(`${base}/asset-partners/${id}/terms-history`),
    proposeTerms: (id: string, input: Partial<Record<'managementFeeBps' | 'insuranceMonthlyCents' | 'detailingMonthlyCents' | 'deductibleCapCents' | 'maintenanceApprovalCents' | 'payoutDayOfMonth', number>> & { requestedFrom?: string; reason?: string }) =>
      api.post<TermsVersion>(`${base}/asset-partners/${id}/terms-change`, input),
    cancelTermsChange: (id: string) => api.post<TermsVersion>(`${base}/asset-partners/${id}/terms-change/cancel`),
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
    overview: (period?: string) => api.get<PortfolioOverview>(`${base}/asset-management/overview`, period ? { period } : {}),
    cars: (period?: string) => api.get<PortfolioCar[]>(`${base}/asset-management/cars`, period ? { period } : {}),
    unassignedCars: () => api.get<{ vehicleId: string; label: string; plate?: string; status: string }[]>(`${base}/asset-management/unassigned-cars`),
    assignCar: (vehicleId: string, partnerId: string) => api.post(`${base}/asset-management/cars/${vehicleId}/assign`, { partnerId }),
    addPartnerCars: (partnerId: string, input: { rows: { vin: string; plate?: string }[]; address?: string }) => api.post<AddCarResult[]>(`${base}/asset-partners/${partnerId}/cars`, input),
    unlinkCar: (vehicleId: string, reason: string) => api.post(`${base}/asset-management/cars/${vehicleId}/unlink`, { reason }),
    returnCar: (vehicleId: string) => api.post(`${base}/asset-management/cars/${vehicleId}/end`, {}),
    repairs: (approval?: RepairApproval) => api.get<PartnerRepair[]>(`${base}/asset-partner-repairs`, approval ? { approval } : {}),
    scheduleRepair: (input: { vehicleId: string; type: RepairType; scheduledFor: string; costCents?: number; notes?: string; damageIncident?: boolean }) =>
      api.post<PartnerRepair>(`${base}/asset-partners/maintenance`, input),
    notices: (status?: NoticeStatus) => api.get<PartnerNotice[]>(`${base}/asset-partner-notices`, status ? { status } : {}),
    assignNotice: (id: string, bookingId: string) => api.post<PartnerNotice>(`${base}/asset-partner-notices/${id}/assign`, { bookingId }),
    absorbNotice: (id: string, note: string) => api.post<PartnerNotice>(`${base}/asset-partner-notices/${id}/absorb`, { note }),
    rejectNotice: (id: string, note: string) => api.post<PartnerNotice>(`${base}/asset-partner-notices/${id}/reject`, { note }),
    noticeAgencyPaid: (id: string, reference?: string) => api.post<PartnerNotice>(`${base}/asset-partner-notices/${id}/agency-paid`, { reference }),
  };
}
