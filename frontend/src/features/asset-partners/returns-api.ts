import { api } from '@/lib/api/client';
import type { IdentityState, PartnerContact, PartnerProfile, ReturnReason, ReturnStatus, AgreementOfferState } from './api';

export type FuelLevel = 'full' | 'three_quarters' | 'half' | 'quarter' | 'empty';
export type ChecklistKey =
  | 'no_trips' | 'delisted' | 'repairs_closed' | 'insurance_removed' | 'toll_tag_removed' | 'gps_removed'
  | 'keys_returned' | 'accessories_removed' | 'papers_removed' | 'interior_checked' | 'condition_photos' | 'odometer_fuel';
export type ManualChecklistKey = 'insurance_removed' | 'toll_tag_removed' | 'gps_removed' | 'keys_returned' | 'accessories_removed' | 'papers_removed' | 'interior_checked';

export interface ChecklistRow {
  key: ChecklistKey;
  label: string;
  hint: string;
  done: boolean;
  auto: boolean;
  required: boolean;
  note?: string;
  doneAt?: string;
}

export interface ReturnCar {
  vehicleId: string;
  label: string;
  plate?: string;
  checklist: ChecklistRow[];
  photos: { url: string; key: string; label?: string }[];
  odometer?: number;
  fuelLevel?: FuelLevel;
  keysReturned?: number;
  damageNotes?: string;
}

export interface ContactAttempt {
  at: string;
  by: string;
  channel: 'call' | 'text' | 'email' | 'letter' | 'visit';
  to: 'partner' | 'emergency_contact' | 'representative';
  outcome: 'no_answer' | 'left_message' | 'reached' | 'bounced' | 'wrong_number';
  note?: string;
}

export interface Handover {
  to: 'owner' | 'representative' | 'estate' | 'storage';
  receiverName: string;
  receiverSignature: string;
  location: string;
  at: string;
  ownerInsuranceConfirmed: boolean;
}

export interface ReturnRow {
  _id: string;
  reference: string;
  reason: ReturnReason;
  status: ReturnStatus;
  partnerId: string;
  partnerName: string;
  cars: { vehicleId: string; label: string; plate?: string }[];
  preferredDate?: string;
  scheduledFor?: string;
  noticeEndsAt?: string;
  runner?: { name: string };
  attempts: number;
  createdAt: string;
}

export interface ReturnDetail {
  _id: string;
  reference: string;
  reason: ReturnReason;
  reasonLabel: string;
  status: ReturnStatus;
  cars: ReturnCar[];
  openedBy: string;
  partnerNote?: string;
  preferredDate?: string;
  handoverPreference?: 'pickup' | 'deliver';
  deliveryAddress?: string;
  noticeSentAt?: string;
  noticeEndsAt?: string;
  attempts: ContactAttempt[];
  reportedBy?: PartnerContact;
  estate?: { contact?: PartnerContact; documents: { index: number; kind: 'death_certificate' | 'authority' | 'other'; uploadedBy: string; uploadedAt: string; verified?: { by: string; at: string } }[] };
  scheduledFor?: string;
  runner?: { staffId?: string; userId: string; name: string; assignedAt: string };
  startedAt?: string;
  submittedAt?: string;
  handover?: Handover;
  sentBack?: { at: string; reason: string };
  approval?: { at: string; note?: string };
  completedAt?: string;
  cancelled?: { at: string; reason: string };
  events: { at: string; by: string; type: string; detail?: string }[];
  partner: {
    _id: string;
    displayName: string;
    email?: string;
    phone?: string;
    status: string;
    lastSeenAt?: string;
    profile?: PartnerProfile;
    payoutHold?: { reason: string; since: string };
  };
  rules: { photoMin: number; separateApprover: boolean };
  scheduleBlockers: string[];
  approveBlockers: string[];
  createdAt: string;
}

export interface WatchRow {
  _id: string;
  displayName: string;
  email?: string;
  phone?: string;
  lastSeenAt?: string;
  visaExpiry?: string;
}

export interface PartnerIdentityView {
  identity: { state: IdentityState; required: boolean; verifiedName?: string; nameMatches: boolean | null; reason?: string; override?: { by: string; at: string; reason: string } };
  offer: AgreementOfferState | null;
  stage: string;
  profile: PartnerProfile | null;
  lastSeenAt?: string;
  payoutHold: { reason: 'unresponsive' | 'deceased'; since: string; exitId?: string } | null;
}

export interface CarPatch {
  items?: { key: ManualChecklistKey; done: boolean; note?: string }[];
  odometer?: number;
  fuelLevel?: FuelLevel;
  keysReturned?: number;
  damageNotes?: string;
  addPhotos?: { key: string; label?: string }[];
  removePhotoKeys?: string[];
}

export interface HandoverInput {
  to: Handover['to'];
  receiverName: string;
  receiverSignature: string;
  location: string;
  ownerInsuranceConfirmed: boolean;
}

/** The runner's own view of one return: where to go, who receives the car, and the checklist. */
export interface RunnerReturn {
  _id: string;
  reference: string;
  reason: ReturnReason;
  status: ReturnStatus;
  scheduledFor?: string;
  handoverPreference?: 'pickup' | 'deliver';
  deliveryAddress?: string;
  receiver?: PartnerContact;
  representative?: PartnerContact;
  cars: ReturnCar[];
  handover?: Handover;
  sentBack?: { at: string; reason: string };
  photoMin: number;
}

export const RETURN_STATUS: Record<ReturnStatus, { label: string; tone: 'warning' | 'success' | 'destructive' | 'muted' | 'default' }> = {
  requested: { label: 'Requested', tone: 'warning' },
  notice: { label: 'Holding earnings', tone: 'warning' },
  scheduled: { label: 'Scheduled', tone: 'default' },
  in_progress: { label: 'Runner on it', tone: 'default' },
  submitted: { label: 'Needs approval', tone: 'warning' },
  completed: { label: 'Returned', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};

export const RETURN_REASON: Record<ReturnReason, string> = {
  partner_request: 'Partner asked',
  unresponsive: 'Can’t reach partner',
  deceased: 'Partner passed away',
};

export const FUEL_LABEL: Record<FuelLevel, string> = { full: 'Full', three_quarters: '3/4', half: '1/2', quarter: '1/4', empty: 'Empty' };

/** Ops side of partner returns; the operations panel calls it under /ioc. */
export function returnsManageApi(base: '/ioc' | '/admin' = '/ioc') {
  return {
    detail: (id: string) => api.get<ReturnDetail>(`${base}/asset-partner-exits/${id}`),
    watchList: () => api.get<{ quietAfterDays: number; quiet: WatchRow[]; visa: WatchRow[]; noEmergencyContact: WatchRow[] }>(`${base}/asset-partner-exits/watch-list`),
    runners: () => api.get<{ _id: string; name: string; email: string }[]>(`${base}/asset-partner-exits/runners`),
    open: (partnerId: string, input: { reason: ReturnReason; vehicleIds?: string[]; note?: string; reportedBy?: PartnerContact; preferredDate?: string }) =>
      api.post<ReturnDetail>(`${base}/asset-partners/${partnerId}/exits`, input),
    logAttempt: (id: string, input: Omit<ContactAttempt, 'at' | 'by'>) => api.post<ReturnDetail>(`${base}/asset-partner-exits/${id}/attempts`, input),
    setEstateContact: (id: string, contact: PartnerContact) => api.put<ReturnDetail>(`${base}/asset-partner-exits/${id}/estate-contact`, contact),
    addEstateDocument: (id: string, input: { kind: 'death_certificate' | 'authority' | 'other'; key: string }) => api.post<ReturnDetail>(`${base}/asset-partner-exits/${id}/estate-documents`, input),
    verifyEstateDocument: (id: string, index: number) => api.post<ReturnDetail>(`${base}/asset-partner-exits/${id}/estate-documents/${index}/verify`),
    viewEstateDocument: (id: string, index: number) => api.get<{ url: string }>(`${base}/asset-partner-exits/${id}/estate-documents/${index}/view`),
    schedule: (id: string, input: { scheduledFor: string; runnerStaffId?: string }) => api.post<ReturnDetail>(`${base}/asset-partner-exits/${id}/schedule`, input),
    cancel: (id: string, reason: string) => api.post<ReturnDetail>(`${base}/asset-partner-exits/${id}/cancel`, { reason }),
    start: (id: string) => api.post<ReturnDetail>(`${base}/asset-partner-exits/${id}/start`),
    updateCar: (id: string, vehicleId: string, patch: CarPatch) => api.patch<ReturnDetail>(`${base}/asset-partner-exits/${id}/cars/${vehicleId}`, patch),
    submit: (id: string, input: HandoverInput) => api.post<ReturnDetail>(`${base}/asset-partner-exits/${id}/submit`, input),
    sendBack: (id: string, reason: string) => api.post<ReturnDetail>(`${base}/asset-partner-exits/${id}/send-back`, { reason }),
    approve: (id: string, note?: string) => api.post<ReturnDetail>(`${base}/asset-partner-exits/${id}/approve`, { note }),
    identity: (partnerId: string) => api.get<PartnerIdentityView>(`${base}/asset-partners/${partnerId}/identity`),
    confirmIdentity: (partnerId: string, reason: string) => api.post<{ confirmed: true }>(`${base}/asset-partners/${partnerId}/identity/confirm`, { reason }),
    resendOffer: (partnerId: string) => api.post<AgreementOfferState>(`${base}/asset-partners/${partnerId}/agreement-offer`),
    releaseHold: (partnerId: string, payee?: { payableTo: string; mailingAddress: string }) => api.post<{ released: true }>(`${base}/asset-partners/${partnerId}/payout-hold/release`, payee ?? {}),
  };
}

/** A runner's (Captain's) own return jobs. */
export const runnerReturnsApi = {
  mine: () => api.get<{ _id: string; reference: string; status: ReturnStatus; scheduledFor?: string; cars: { vehicleId: string; label: string; plate?: string }[]; sentBack?: { reason: string } }[]>('/asset-partner-returns/mine'),
  detail: (id: string) => api.get<RunnerReturn>(`/asset-partner-returns/${id}`),
  start: (id: string) => api.post<RunnerReturn>(`/asset-partner-returns/${id}/start`),
  updateCar: (id: string, vehicleId: string, patch: CarPatch) => api.patch<RunnerReturn>(`/asset-partner-returns/${id}/cars/${vehicleId}`, patch),
  submit: (id: string, input: HandoverInput) => api.post<RunnerReturn>(`/asset-partner-returns/${id}/submit`, input),
};
