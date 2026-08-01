import { applyBps, zeroMoney, type Money } from '../../../core/types/money';

type Policy = 'flexible' | 'moderate' | 'strict';
export type CancellationRules = Record<Policy, { fullBeforeHours: number; partialBps: number }>;

/**
 * Maps time-before-trip → refund percentage (bps). Deterministic and fair: the
 * same inputs always produce the same refund. The thresholds are NOT hardcoded —
 * they come from PlatformConfig.cancellation so finance can retune them from the
 * admin panel without a deploy.
 */
export function computeRefund(
  policy: Policy,
  total: Money,
  tripStart: Date,
  rules: CancellationRules,
  now = new Date(),
): Money {
  const rule = rules[policy];
  const hoursUntilStart = (tripStart.getTime() - now.getTime()) / 3_600_000;
  if (hoursUntilStart >= rule.fullBeforeHours) return { ...total };
  if (rule.partialBps > 0) return applyBps(total, rule.partialBps);
  return zeroMoney(total.currency);
}
