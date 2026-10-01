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
  /** Kept in full on a late cancellation (the service fee); the partial refund applies to the rest. */
  keepOnLate: number = 0,
): Money {
  const rule = rules[policy];
  const hoursUntilStart = (tripStart.getTime() - now.getTime()) / 3_600_000;
  if (hoursUntilStart >= rule.fullBeforeHours) return { ...total };
  const rest = { amount: Math.max(0, total.amount - Math.min(Math.max(0, keepOnLate), total.amount)), currency: total.currency };
  if (rule.partialBps > 0) return applyBps(rest, rule.partialBps);
  return zeroMoney(total.currency);
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
