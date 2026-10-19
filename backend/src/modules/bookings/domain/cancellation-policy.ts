import { applyBps, zeroMoney, type Money } from '../../../core/types/money';

export type Policy = 'flexible' | 'moderate' | 'strict';
export type CancellationRules = Record<Policy, { fullBeforeHours: number; partialBps: number }>;

/**
 * Maps time-before-trip → refund percentage (bps). Deterministic and fair: the
 * same inputs always produce the same refund. The thresholds are NOT hardcoded —
 * they come from PlatformConfig.cancellation so finance can retune them from the
 * admin panel without a deploy.
 */
/** The refund and the rule that produced it, so the guest can be told exactly why. */
export interface RefundExplanation {
  refund: Money;
  kind: 'full' | 'partial' | 'none';
  policy: Policy;
  hoursBefore: number;
  fullBeforeHours: number;
  partialPct: number;
  /** The service fee kept on a late cancellation, in minor units. */
  feeKept: number;
}

export function explainRefund(
  policy: Policy,
  total: Money,
  tripStart: Date,
  rules: CancellationRules,
  now = new Date(),
  keepOnLate = 0,
): RefundExplanation {
  const rule = rules[policy];
  const hoursBefore = (tripStart.getTime() - now.getTime()) / 3_600_000;
  const base = { policy, hoursBefore, fullBeforeHours: rule.fullBeforeHours, partialPct: rule.partialBps / 100 };
  if (hoursBefore >= rule.fullBeforeHours) return { ...base, refund: { ...total }, kind: 'full', feeKept: 0 };
  const feeKept = Math.min(Math.max(0, keepOnLate), total.amount);
  const rest = { amount: total.amount - feeKept, currency: total.currency };
  if (rule.partialBps > 0) return { ...base, refund: applyBps(rest, rule.partialBps), kind: 'partial', feeKept };
  return { ...base, refund: zeroMoney(total.currency), kind: 'none', feeKept };
}

export function computeRefund(
  policy: Policy,
  total: Money,
  tripStart: Date,
  rules: CancellationRules,
  now = new Date(),
  /** Kept in full on a late cancellation (the service fee); the partial refund applies to the rest. */
  keepOnLate: number = 0,
): Money {
  return explainRefund(policy, total, tripStart, rules, now, keepOnLate).refund;
}

/**
 * The service fee on a booking. Older bookings never stored it as its own line, so it is whatever the
 * total holds beyond the trip subtotal, protection and tax.
 */
export function serviceFeeOf(pb: {
  total: Money;
  serviceFee?: Money;
  subtotal?: Money;
  protection?: Money;
  taxTotal?: Money;
}): number {
  if (pb.serviceFee) return pb.serviceFee.amount;
  if (!pb.subtotal) return 0;
  const rest = pb.total.amount - pb.subtotal.amount - (pb.protection?.amount ?? 0) - (pb.taxTotal?.amount ?? 0);
  return Math.max(0, Math.min(rest, pb.total.amount));
}
