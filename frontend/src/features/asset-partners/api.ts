import { api } from '@/lib/api/client';

export interface AssetPartnerVehicle {
  year: string;
  make: string;
  model: string;
  trim?: string;
  mileage: number;
  exteriorColor?: string;
  interiorColor?: string;
  vin: string;
  plate: string;
}

export interface CreateAssetPartnerApplicationInput {
  fullName: string;
  businessName?: string;
  partnerType: 'individual' | 'business' | 'fleet';
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  referral?: string;
  vehicle: AssetPartnerVehicle;
  ownership: 'owned' | 'financed' | 'leased';
  lienholder?: string;
  lienAccountLast4?: string;
  estimatedMarketValue?: string;
  accident: 'yes' | 'no';
  accidentDetail?: string;
  smokeFree: 'yes' | 'no';
  petFree: 'yes' | 'no';
  hasMaintenanceRecords?: 'yes' | 'no';
  photos?: { url: string; key?: string; label?: string }[];
  insurance: {
    carrier: string;
    policyNumber: string;
    coverageType: 'full' | 'liability' | 'unsure';
    policyExpiry?: string;
  };
  availability: 'fulltime' | 'parttime' | 'seasonal';
  preferredZone?: string;
  targetStartDate?: string;
  notes?: string;
  acknowledgedAccurate: boolean;
  acknowledgedInspection: boolean;
  acknowledgedTerms: boolean;
  signature: string;
  signDate: string;
}

export type ApplicationStatus = 'submitted' | 'under_review' | 'changes_requested' | 'approved' | 'rejected';

/** From the partner portal the account's own email is used. */
export type PortalApplicationInput = Omit<CreateAssetPartnerApplicationInput, 'email'>;

export type OnboardingStage = 'verify_email' | 'apply' | 'review' | 'changes' | 'rejected' | 'profile' | 'identity' | 'agreement' | 'agreement_expired' | 'documents' | 'payout' | 'ready';

export interface PartnerContact {
  name: string;
  phone: string;
  relation: string;
  email?: string;
}

export type Residency = 'citizen' | 'permanent_resident' | 'visa' | 'other';

export interface PartnerProfile {
  emergencyContacts: PartnerContact[];
  representative?: PartnerContact;
  residency?: Residency;
  visaExpiry?: string;
  preferredContact?: 'call' | 'text' | 'email';
  completedAt?: string;
}

export type PartnerProfileInput = {
  emergencyContacts: PartnerContact[];
  representative?: PartnerContact | null;
  residency: Residency;
  visaExpiry?: string;
  preferredContact?: 'call' | 'text' | 'email';
};

export type IdentityState = 'verified' | 'confirmed_by_staff' | 'pending' | 'rejected' | 'not_started';

/** The window to sign: it lapses after a set number of days and has to be sent again. */
export interface AgreementOfferState {
  sentAt: string;
  expiresAt: string;
  expired: boolean;
  daysLeft: number;
  reissueRequestedAt?: string;
}

export interface RejectionExplained {
  reasons: { code: string; label: string; why: string; improve: string }[];
  improvements?: string;
  reapplyAfter?: string;
  canReapply: boolean;
}

export type ReturnStatus = 'requested' | 'notice' | 'scheduled' | 'in_progress' | 'submitted' | 'completed' | 'cancelled';
export type ReturnReason = 'partner_request' | 'unresponsive' | 'deceased';

export interface PartnerReturn {
  _id: string;
  reference: string;
  reason: ReturnReason;
  status: ReturnStatus;
  cars: { vehicleId: string; label: string; plate?: string }[];
  preferredDate?: string;
  scheduledFor?: string;
  handoverPreference?: 'pickup' | 'deliver';
  deliveryAddress?: string;
  noticeEndsAt?: string;
  completedAt?: string;
  cancelled?: { at: string; reason: string };
  handover?: { to: string; receiverName: string; at: string; location: string };
  canCancel: boolean;
  canRespond: boolean;
  createdAt: string;
}


export type FuelLevel = 'full' | 'three_quarters' | 'half' | 'quarter';
export type IntakeStatus = 'awaiting_partner' | 'acknowledged' | 'objected' | 'deemed_accepted';

export interface IntakeReport {
  _id: string;
  partnerId: string;
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
  photos: { url: string; key?: string; label?: string }[];
  catodriveSignature: { name: string; title: string; signedAt: string };
  partnerResponse?: { kind: 'acknowledged' | 'objected'; signedName?: string; objection?: string; at: string };
  status: IntakeStatus;
  respondBy: string;
  createdAt: string;
}

export interface SignableDocument {
  version: number;
  title: string;
  /** Already carries the partner's details; licence and payout placeholders are filled as they type. */
  body: string;
}

export type PartnerDocCategory = 'w9' | 'kyc' | 'title' | 'insurance' | 'registration';

export interface OnboardingDocument {
  category: PartnerDocCategory;
  label: string;
  hint: string;
  uploaded: boolean;
  status?: 'pending' | 'verified' | 'rejected';
}

export type PayoutElection =
  | { method: 'zelle'; zelleHandle: string; zelleName: string }
  | { method: 'check'; payableTo: string; mailingAddress: string };

export interface SignDocumentsInput {
  agreementVersion: number;
  ndaVersion: number;
  signedName: string;
  licenceNumber: string;
  licenceState: string;
  payout: PayoutElection;
  acceptAgreement: true;
  acceptNda: true;
  acknowledgeDeductibles: true;
}

export interface PartnerOnboarding {
  stage: OnboardingStage;
  email?: string;
  emailVerified: boolean;
  application?: PartnerApplicationDetail;
  partner?: { displayName: string; status: PartnerStatus };
  agreement?: SignableDocument | null;
  nda?: SignableDocument | null;
  prefill?: Record<string, string>;
  documents?: OnboardingDocument[];
  payoutMethod?: 'check' | 'zelle';
  profile?: PartnerProfile & { ownPhone?: string };
  identity?: { state: IdentityState; reason?: string };
  offer?: AgreementOfferState | null;
  rejection?: RejectionExplained;
}

export interface VinLookup {
  decoded: { vin: string; year?: number; make?: string; model?: string; trim?: string } | null;
  alreadyWithUs: boolean;
}

export interface PartnerApplication {
  _id: string;
  reference: string;
  status: ApplicationStatus;
  fullName: string;
  businessName?: string;
  email: string;
  phone?: string;
  vehicle: AssetPartnerVehicle;
  availability: 'fulltime' | 'parttime' | 'seasonal';
  preferredZone?: string;
  targetStartDate?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewNotes?: string;
  hostVerified?: boolean;
  kind?: 'partner' | 'vehicle';
}

/** Everything an application holds, as the applicant entered it. */
export interface PartnerApplicationDetail extends PartnerApplication {
  partnerType: 'individual' | 'business' | 'fleet';
  address: string;
  city: string;
  state: string;
  zip: string;
  ownership: 'owned' | 'financed' | 'leased';
  lienholder?: string;
  hadAccident: boolean;
  accidentDetail?: string;
  smokeFree: boolean;
  petFree: boolean;
  photos: { url: string; key?: string; label?: string }[];
  insurance: { carrier: string; policyNumber: string; coverageType: 'full' | 'liability' | 'unsure'; policyExpiry?: string };
  notes?: string;
  signature: string;
  signedAt: string;
}

export interface PartnerVehicleSummary {
  _id: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  status: string;
  photo?: string;
  trips: number;
  /** Gross booking revenue this car produced this month, in minor units. */
  gross: number;
  /** Partner net for this car this month - gross less fee, insurance, detailing. */
  net: number;
}

export type PartnerStatus = 'onboarding' | 'active' | 'suspended' | 'exited';

/** The terms actually in force for this partner. */
export interface ResolvedPartnerTerms {
  managementFeeBps: number;
  insuranceMonthlyCents: number;
  detailingMonthlyCents: number;
  deductibleCapCents: number;
  maintenanceApprovalCents: number;
  payoutDayOfMonth: number;
  payoutMethod: 'check' | 'zelle';
  /** True when something was negotiated away from the platform default. */
  negotiated: boolean;
}

export interface StatementLine {
  vehicleId: string;
  label: string;
  trips: number;
  gross: number;
  managementFee: number;
  insurance: number;
  detailing: number;
  net: number;
}

/**
 * One month on partner terms. NOT host earnings - the management fee is only
 * one of three deductions, and the other two are recurring monthly costs per
 * vehicle.
 */
export interface PartnerStatement {
  /** 'YYYY-MM' - the month trips completed in. */
  period: string;
  currency: string;
  terms: ResolvedPartnerTerms;
  lines: StatementLine[];
  totals: {
    trips: number;
    gross: number;
    managementFee: number;
    insurance: number;
    detailing: number;
    net: number;
  };
  payoutDate: string;
  payoutMethod: string;
  /** False while the month is still running - figures can still move. */
  final: boolean;
  /** Set once CatoDrive has recorded sending this month's money. */
  paid?: { amount: number; method: string; reference: string; paidAt: string };
}

export interface PartnerDashboard {
  applications: PartnerApplication[];
  /** Programme membership. Absent until an application is approved. */
  partner?: {
    _id: string;
    status: PartnerStatus;
    partnerType: 'individual' | 'business' | 'fleet';
    displayName: string;
    approvedAt?: string;
    activatedAt?: string;
  };
  /** This month so far, on partner terms. Absent until in the programme. */
  currentStatement?: PartnerStatement;
  /** Recent months, newest first. */
  history?: PartnerStatement[];
  vehicles: PartnerVehicleSummary[];
}

export interface VehicleTripSummary {
  bookingId: string;
  code: string;
  status: string;
  start: string;
  end: string;
  gross: number;
}

export interface PartnerVehicleDetail extends PartnerVehicleSummary {
  vin?: string;
  plate?: string;
  createdAt: string;
  /** Recent completed trips, newest first. */
  recentTrips: VehicleTripSummary[];
  /** This car's net across recent months, oldest first (chart order). */
  monthly: { period: string; net: number; gross: number }[];
}

export type MaintenanceApproval = 'not_required' | 'pending' | 'approved' | 'declined';

export interface MaintenanceRequest {
  _id: string;
  vehicleId: string;
  type: 'service' | 'repair' | 'inspection' | 'cleaning';
  scheduledFor: string;
  cost?: number;
  odometerKm?: number;
  notes?: string;
  status: 'scheduled' | 'in_progress' | 'completed';
  approval: MaintenanceApproval;
  approvalThresholdCents?: number;
  approvedAt?: string;
  declineReason?: string;
  createdAt: string;
}

export interface PayoutDetails {
  mailingAddress?: string;
  zelleHandle?: string;
}

/** The partner's own full membership record - payoutDetails included. */
export interface PartnerMe {
  partner: {
    _id: string;
    status: PartnerStatus;
    partnerType: 'individual' | 'business' | 'fleet';
    displayName: string;
    payoutDetails?: PayoutDetails;
    agreement?: { version: number; signedAt: string };
    nda?: { version: number; signedAt: string };
  };
  terms: ResolvedPartnerTerms;
}

export const assetPartnerApi = {
  apply: (input: CreateAssetPartnerApplicationInput) =>
    api.post<{ reference: string; status: string }>('/asset-partner-applications', input),
  dashboard: () => api.get<PartnerDashboard>('/asset-partners/dashboard'),
  /** Null when the caller isn't enrolled - see the profile page's guard. */
  me: () => api.get<PartnerMe | null>('/asset-partners/me'),

  // The portal - vehicles, one car's own history, the statement archive.
  vehicles: () => api.get<PartnerVehicleSummary[]>('/asset-partners/vehicles'),
  vehicle: (id: string) => api.get<PartnerVehicleDetail>(`/asset-partners/vehicles/${id}`),
  statements: (months = 12) => api.get<PartnerStatement[]>('/asset-partners/statements', { months }),

  // Getting started on the partner portal.
  onboarding: () => api.get<PartnerOnboarding>('/asset-partners/onboarding'),
  submitApplication: (input: PortalApplicationInput) => api.post<PartnerApplicationDetail>('/asset-partners/me/applications', input),
  resubmitApplication: (id: string, input: PortalApplicationInput) => api.patch<PartnerApplicationDetail>(`/asset-partners/me/applications/${id}`, input),
  signDocuments: (input: SignDocumentsInput) => api.post('/asset-partners/me/agreement', input),
  requestNewOffer: () => api.post<AgreementOfferState | null>('/asset-partners/me/agreement/reissue-request'),
  profile: () => api.get<{ profile: PartnerProfile | null; ownPhone?: string; identity: { state: IdentityState; required: boolean; reason?: string } }>('/asset-partners/me/profile'),
  saveProfile: (input: PartnerProfileInput) => api.put<PartnerProfile>('/asset-partners/me/profile', input),
  returns: () => api.get<{ noticeDays: number; earliestDate: string; exits: PartnerReturn[] }>('/asset-partners/me/returns'),
  requestReturn: (input: { vehicleIds: string[]; preferredDate: string; note?: string; handoverPreference: 'pickup' | 'deliver'; deliveryAddress?: string }) =>
    api.post<PartnerReturn>('/asset-partners/me/returns', input),
  cancelReturn: (id: string) => api.post<{ _id: string; status: ReturnStatus }>(`/asset-partners/me/returns/${id}/cancel`),
  /** "I'm here" - an unreachable partner gets back in touch. */
  respondToNotice: (id: string) => api.post<{ _id: string; status: ReturnStatus }>(`/asset-partners/me/returns/${id}/respond`),
  downloadSigned: (kind: 'agreement' | 'nda') => api.download(`/asset-partners/me/signed/${kind}`),
  /** Audit trail: steps the signer takes before signing. Best effort; never blocks signing. */
  signingEvent: (purpose: EnvelopePurpose, type: 'opened' | 'read_agreement' | 'read_nda' | 'read_amendment' | 'consented') =>
    api.post<{ recorded: boolean }>('/asset-partners/me/signing-events', { purpose, type }).catch(() => undefined),
  envelopes: () => api.get<SignatureEnvelope[]>('/asset-partners/me/envelopes'),
  downloadSealed: (documentId: string) => api.download(`/asset-partners/me/signed-documents/${documentId}`),
  amendment: () => api.get<TermsAmendment | null>('/asset-partners/me/amendment'),
  signAmendment: (input: { versionId: string; signedName: string; templateVersion: number }) =>
    api.post<{ envelopeId: string; effectiveFrom: string }>('/asset-partners/me/amendment/sign', input),
  declineAmendment: () => api.post<{ declined: true }>('/asset-partners/me/amendment/decline'),
  /** Public: anyone can check an envelope ID or a file's fingerprint. */
  verifyEnvelope: (envelopeId: string) => api.get<EnvelopeCheck>(`/agreements/verify/${encodeURIComponent(envelopeId)}`, undefined, false),
  verifyFile: (sha256: string) => api.get<EnvelopeCheck & { documentId?: string }>(`/agreements/verify-file/${sha256}`, undefined, false),
  intakes: () => api.get<IntakeReport[]>('/asset-partners/me/intakes'),
  respondIntake: (id: string, body: { kind: 'acknowledged'; signedName: string } | { kind: 'objected'; objection: string }) =>
    api.post<IntakeReport>(`/asset-partners/me/intakes/${id}/respond`, body),
  downloadIntake: (id: string) => api.download(`/asset-partners/me/intakes/${id}/pdf`),
  lookupVin: (vin: string) => api.get<VinLookup>(`/asset-partners/vin/${encodeURIComponent(vin)}`),

  // Self-service payout recipient details. NOT terms - see the backend route.
  setPayoutDetails: (details: PayoutDetails) =>
    api.patch<{ payoutDetails: PayoutDetails }>('/asset-partners/payout-details', details),

  // Maintenance approvals - the partner's yes/no on anything ops scheduled
  // above their agreed threshold.
  maintenance: (approval?: MaintenanceApproval) =>
    api.get<MaintenanceRequest[]>('/asset-partners/maintenance', approval ? { approval } : {}),
  approveMaintenance: (id: string) =>
    api.post<MaintenanceRequest>(`/asset-partners/maintenance/${id}/approve`),
  declineMaintenance: (id: string, reason?: string) =>
    api.post<MaintenanceRequest>(`/asset-partners/maintenance/${id}/decline`, { reason }),
};

export type EnvelopePurpose = 'onboarding' | 'amendment';
export type SigningEventType = 'sent' | 'opened' | 'read_agreement' | 'read_nda' | 'read_amendment' | 'consented' | 'signed' | 'countersigned' | 'completed' | 'copy_sent' | 'declined';

export interface SigningEvent {
  type: SigningEventType;
  at: string;
  ip?: string;
  detail?: string;
}

/** One sealed signing: its ID, the documents in it, and every step. */
export interface SignatureEnvelope {
  envelopeId: string;
  purpose: EnvelopePurpose;
  completedAt: string;
  documents: { documentId: string; kind: 'agreement' | 'nda' | 'amendment'; title: string; version: number; textHash: string; pdfHash: string }[];
  signer: { name: string; email?: string; ip?: string };
  countersigner: { name: string; title: string; organisation: string };
  events: SigningEvent[];
  /** Steps after sealing, e.g. copies sent. */
  after: SigningEvent[];
}

export interface TermsAmendment {
  versionId: string;
  title: string;
  version: number;
  body: string;
  from: Record<string, string>;
  to: Record<string, string>;
  requestedFrom: string;
  reason?: string;
}

export interface EnvelopeCheck {
  valid: boolean;
  envelope?: { envelopeId: string; purpose: EnvelopePurpose; completedAt: string; signer: string; countersignedBy: string; documents: { documentId: string; title: string; version: number }[] };
}

export const SIGNING_EVENT_LABEL: Record<SigningEventType, string> = {
  sent: 'Ready to sign',
  opened: 'Opened',
  read_agreement: 'Agreement read to the end',
  read_nda: 'NDA read to the end',
  read_amendment: 'Change read to the end',
  consented: 'Agreed to sign electronically',
  signed: 'Signed',
  countersigned: 'Countersigned by CatoDrive',
  completed: 'Completed and sealed',
  copy_sent: 'Copy sent',
  declined: 'Declined',
};

export const TERM_LABEL: Record<string, string> = {
  management_fee: 'Management fee',
  insurance_monthly: 'Insurance per car per month',
  detailing_monthly: 'Detailing per car per month',
  deductible_cap: 'Damage cap per incident',
  maintenance_approval: 'Repairs needing approval above',
  payout_day: 'Payout day',
};
