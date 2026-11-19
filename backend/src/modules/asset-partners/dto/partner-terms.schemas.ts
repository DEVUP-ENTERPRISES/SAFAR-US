import { z } from 'zod';

// Sane bounds for every Asset Partner money term; the ops and admin forms use the same numbers.
export const TERM_LIMITS = {
  managementFeeBps: { min: 0, max: 5_000 },
  insuranceMonthlyCents: { min: 0, max: 200_000 },
  detailingMonthlyCents: { min: 0, max: 100_000 },
  deductibleCapCents: { min: 0, max: 2_500_000 },
  maintenanceApprovalCents: { min: 0, max: 1_000_000 },
  payoutDayOfMonth: { min: 1, max: 28 },
} as const;

const bounded = (k: keyof typeof TERM_LIMITS) => z.number().int().min(TERM_LIMITS[k].min).max(TERM_LIMITS[k].max).optional();

export const partnerTermsShape = {
  managementFeeBps: bounded('managementFeeBps'),
  insuranceMonthlyCents: bounded('insuranceMonthlyCents'),
  detailingMonthlyCents: bounded('detailingMonthlyCents'),
  deductibleCapCents: bounded('deductibleCapCents'),
  maintenanceApprovalCents: bounded('maintenanceApprovalCents'),
  payoutDayOfMonth: bounded('payoutDayOfMonth'),
};
