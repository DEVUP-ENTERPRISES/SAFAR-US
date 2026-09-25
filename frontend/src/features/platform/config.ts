'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

export interface CancellationRule {
  fullBeforeHours: number;
  partialBps: number;
}

/** Guest-safe platform economics from GET /platform/config (no internal rates). */
export interface PlatformPublicConfig {
  cancellation: {
    flexible: CancellationRule;
    moderate: CancellationRule;
    strict: CancellationRule;
  };
  deposit: { enabled: boolean; minCents: number; maxCents: number; multiplierBps: number };
  pricing: { earlyBirdMinDaysAhead: number; lastMinuteMaxHoursAhead: number };
  /** Protection tiers a guest can buy at checkout; priced per day in cents. */
  protection: { code: string; label: string; description: string; pricePerDay: number }[];
  /** The platform's default take rate. An individual host's rate can be lower
   *  if a CommissionRule matches, so treat this as a floor on host earnings. */
  hostTakeRateBps: number;
  /** Terms/privacy versions the client must display + submit, and the minimum
   *  rental age that gates account setup. */
  legal: {
    termsVersion: string;
    termsUrl: string;
    privacyVersion: string;
    privacyUrl: string;
    minAgeYears: number;
  };
  /** Stripe publishable key served at runtime; null when the platform has none. */
  stripe?: { publishableKey: string | null };
  /** Absent on a backend that predates the handover gates. */
  handover?: {
    hostInspectionRequired: boolean;
    pickupCodeRequired: boolean;
    maxCodeAttempts: number;
    hostOnlyStart: boolean;
    baselineRequiredForCharges: boolean;
  };
  /** Absent on a backend that predates the lead-time setting. */
  booking?: { minLeadMinutes: number };
}

/** Platform default when the config has not loaded or predates the setting. */
const DEFAULT_MIN_LEAD_MINUTES = 60;

/** Soonest a trip can start: the platform minimum, raised by the car's own advance notice. */
export function leadMinutes(cfg: PlatformPublicConfig | undefined, advanceNoticeHours = 0): number {
  const platform = cfg?.booking?.minLeadMinutes ?? DEFAULT_MIN_LEAD_MINUTES;
  return Math.max(platform, Math.max(0, advanceNoticeHours) * 60);
}

/** Human form of a lead time, e.g. "1 hour", "90 minutes", "2 days". */
export function describeLead(minutes: number): string {
  if (minutes % 1440 === 0) return minutes === 1440 ? '1 day' : `${minutes / 1440} days`;
  if (minutes % 60 === 0) return minutes === 60 ? '1 hour' : `${minutes / 60} hours`;
  return `${minutes} minutes`;
}

export const platformApi = {
  config: () => api.get<PlatformPublicConfig>('/platform/config', undefined, false),
};

/** Cached app-wide; these values change rarely (admin retunes them). */
export function usePlatformConfig() {
  return useQuery({
    queryKey: ['platform-config'],
    queryFn: () => platformApi.config(),
    staleTime: 5 * 60 * 1000,
  });
}

const POLICY_TITLES: Record<string, string> = { flexible: 'Flexible', moderate: 'Moderate', strict: 'Strict' };

function humanHours(h: number): string {
  if (h % 24 === 0) {
    const d = h / 24;
    return d === 1 ? '1 day' : `${d} days`;
  }
  return `${h} hours`;
}

/**
 * The guest-facing cancellation description, generated from the live config so
 * the copy always matches what a cancellation actually settles against — no
 * hardcoded "24 hours / 50%" text that can drift from the admin's real rules.
 */
export function describeCancellation(
  policy: 'flexible' | 'moderate' | 'strict',
  cfg?: PlatformPublicConfig,
): { title: string; detail: string } {
  const title = POLICY_TITLES[policy] ?? policy;
  const rule = cfg?.cancellation?.[policy];
  if (!rule) return { title, detail: '' };
  const before = humanHours(rule.fullBeforeHours);
  const after = rule.partialBps > 0 ? `${Math.round(rule.partialBps / 100)}% refunded after that` : 'non-refundable after that';
  return { title, detail: `Full refund if you cancel more than ${before} before the trip starts; ${after}.` };
}
