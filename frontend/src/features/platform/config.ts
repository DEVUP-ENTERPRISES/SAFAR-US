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
