/**
 * The late-return fee for `hours` started hours past the grace period: an hourly fee for the first hours, then the car's
 * half-day price, then whole days. Each band adds to the one before, so the fee never drops as lateness grows.
 */
export function lateFeeCents(
  hours: number,
  rule: { perHourCents: number; hourlyMaxHours: number; halfDayMaxHours: number; dayCents: number },
): number {
  if (hours <= 0) return 0;
  const hourly = Math.min(hours, rule.hourlyMaxHours) * rule.perHourCents;
  if (hours <= rule.hourlyMaxHours) return hourly;
  const days = hours <= rule.halfDayMaxHours ? 0.5 : Math.ceil(hours / 24);
  return Math.round(hourly + days * rule.dayCents);
}

/** The car's day price on this booking, before discounts. */
export const dayPriceCents = (pb: { days?: number; base?: { amount: number } }) =>
  pb.base && pb.days ? Math.round(pb.base.amount / pb.days) : 0;
