import { applyBps, zeroMoney, type Money } from '../../../core/types/money';

type Policy = 'flexible' | 'moderate' | 'strict';

/**
 * Maps time-before-trip → refund percentage (bps). Deterministic and fair:
 * the same inputs always produce the same refund.
 */
const RULES: Record<Policy, { fullBeforeHours: number; partialBps: number }> = {
  flexible: { fullBeforeHours: 24, partialBps: 5000 }, // full >24h, else 50%
  moderate: { fullBeforeHours: 48, partialBps: 5000 }, // full >48h, else 50%
  strict: { fullBeforeHours: 168, partialBps: 0 }, // full >7d, else 0%
};

export function computeRefund(policy: Policy, total: Money, tripStart: Date, now = new Date()): Money {
  const rule = RULES[policy];
  const hoursUntilStart = (tripStart.getTime() - now.getTime()) / 3_600_000;
  if (hoursUntilStart >= rule.fullBeforeHours) return { ...total };
  if (rule.partialBps > 0) return applyBps(total, rule.partialBps);
  return zeroMoney(total.currency);
}
