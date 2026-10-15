import type { ApplicationStatus, MaintenanceApproval, PartnerApplication, PartnerStatus } from './api';

export type PartnerTone = 'default' | 'success' | 'warning' | 'destructive' | 'muted';

/** Where an application stands, in the partner's words. */
export const APPLICATION_STATUS: Record<ApplicationStatus, { label: string; tone: PartnerTone; detail: string }> = {
  submitted: { label: 'Submitted', tone: 'warning', detail: 'We have your application. A partner manager reviews it and comes back within 2 business days.' },
  changes_requested: { label: 'Needs changes', tone: 'warning', detail: 'We need a few changes before we can continue. See the note below.' },
  under_review: { label: 'Under review', tone: 'warning', detail: 'Your vehicle and documents are being checked. We’ll call you to arrange the inspection.' },
  approved: { label: 'Approved', tone: 'success', detail: 'You’re approved. Once onboarding and the inspection are done, your car goes live and starts earning.' },
  rejected: { label: 'Not approved', tone: 'destructive', detail: 'We couldn’t take this vehicle on. The reason is below - talk to us if anything has changed.' },
};

export const APPLICATION_STAGES = ['Submitted', 'Under review', 'Approved', 'Earning'] as const;

/** Which of the four stages an application has reached. */
export function applicationStage(app: PartnerApplication, isEarning: boolean): number {
  if (isEarning) return 3;
  if (app.status === 'approved') return 2;
  if (app.status === 'under_review') return 1;
  return 0;
}

export const PARTNER_STATUS: Record<PartnerStatus, { label: string; tone: PartnerTone }> = {
  onboarding: { label: 'Onboarding', tone: 'warning' },
  active: { label: 'Active', tone: 'success' },
  suspended: { label: 'Suspended', tone: 'destructive' },
  exited: { label: 'Exited', tone: 'muted' },
};

export const MAINTENANCE_FILTERS: { value: MaintenanceApproval | 'all'; label: string }[] = [
  { value: 'pending', label: 'Needs you' },
  { value: 'approved', label: 'Approved' },
  { value: 'declined', label: 'Declined' },
  { value: 'not_required', label: 'Routine' },
  { value: 'all', label: 'All' },
];

export const MAINTENANCE_TONE: Record<MaintenanceApproval, PartnerTone> = {
  pending: 'warning',
  approved: 'success',
  declined: 'destructive',
  not_required: 'muted',
};

export const MAINTENANCE_LABEL: Record<MaintenanceApproval, string> = {
  pending: 'Needs your approval',
  approved: 'You approved',
  declined: 'You declined',
  not_required: 'Routine - no approval needed',
};

export type PartnerDocCategory = 'insurance' | 'registration';

/** What a partner can upload for their cars. */
export const PARTNER_DOC_CATEGORIES: { value: PartnerDocCategory; label: string }[] = [
  { value: 'insurance', label: 'Insurance policy' },
  { value: 'registration', label: 'Registration / title' },
];

export const DOC_CATEGORY_LABEL: Record<string, string> = {
  insurance: 'Insurance policy',
  registration: 'Registration / title',
  kyc: 'Identity',
  claim: 'Claim evidence',
  pollution: 'Emissions',
  fitness: 'Fitness',
};

/** A document within this many days of expiry is flagged. */
export const EXPIRY_WARNING_DAYS = 45;

export const daysUntil = (date: string): number => Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
