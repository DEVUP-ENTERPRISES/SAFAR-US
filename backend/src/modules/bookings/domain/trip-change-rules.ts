export const CANCEL_REASONS = [
  'plans_changed',
  'found_other_car',
  'flight_delayed',
  'flight_cancelled',
  'weather',
  'health',
  'price',
  'other',
] as const;
export type CancelReasonCode = (typeof CANCEL_REASONS)[number];

/** Reasons outside the guest's control: a late cancellation for these can be reviewed as an exception. */
export const EXCEPTION_REASONS = ['flight_cancelled', 'weather', 'health', 'other'] as const;
export type ExceptionReasonCode = (typeof EXCEPTION_REASONS)[number];

export interface TripChangeRules {
  undoWindowMinutes: number;
  undoMinLeadHours: number;
  undoPer30Days: number;
  pickupShiftMaxHours: number;
  pickupShiftsPerTrip: number;
  freeMovesPerTrip: number;
  moveMinLeadHours: number;
  creditBonusBps: number;
}

const MIN = 60_000;
const HOUR = 3_600_000;
// A tap at 9:59 that lands at 10:01 still counts.
const UNDO_CLOCK_ALLOWANCE_MS = 30_000;

/** When the free undo window closes, or null when this booking never had one or it is used up. */
export function undoWindowEndsAt(
  booking: { createdAt: Date; start: Date },
  rules: Pick<TripChangeRules, 'undoWindowMinutes' | 'undoMinLeadHours' | 'undoPer30Days'>,
  undosLast30Days: number,
): Date | null {
  if (rules.undoWindowMinutes <= 0 || undosLast30Days >= rules.undoPer30Days) return null;
  const ends = new Date(booking.createdAt.getTime() + rules.undoWindowMinutes * MIN);
  // The pickup must still be far enough away at the moment the window closes, or the car was held for nothing.
  if (booking.start.getTime() - ends.getTime() < rules.undoMinLeadHours * HOUR) return null;
  return ends;
}

export function inUndoWindow(endsAt: Date | null, now = new Date()): boolean {
  return !!endsAt && now.getTime() <= endsAt.getTime() + UNDO_CLOCK_ALLOWANCE_MS;
}

/** The extra credit a guest gets for keeping the refund with us; whole cents, never negative. */
export function creditBonus(refundCents: number, bonusBps: number): number {
  if (refundCents <= 0 || bonusBps <= 0) return 0;
  return Math.floor((refundCents * bonusBps) / 10_000);
}

/**
 * The pickup times a guest may shift to: every whole hour after the booked start, up to the limit,
 * that still leaves the car's minimum trip length before the return time.
 */
export function pickupShiftChoices(
  start: Date,
  end: Date,
  maxHours: number,
  minTripHours: number,
): Date[] {
  const out: Date[] = [];
  for (let h = 1; h <= maxHours; h++) {
    const at = new Date(start.getTime() + h * HOUR);
    if (end.getTime() - at.getTime() >= Math.max(1, minTripHours) * HOUR) out.push(at);
  }
  return out;
}

/** Scale a booking's split to a new total so ledger, payout and receipt stay in proportion; rounding goes to tax, like refunds. */
export function scaleSplit(
  split: { hostEarnings: number; commission: number; tax: number },
  fromTotal: number,
  toTotal: number,
): { hostEarnings: number; commission: number; tax: number } {
  if (fromTotal <= 0) return { hostEarnings: 0, commission: 0, tax: toTotal };
  const hostEarnings = Math.round((toTotal * split.hostEarnings) / fromTotal);
  const commission = Math.round((toTotal * split.commission) / fromTotal);
  return { hostEarnings, commission, tax: toTotal - hostEarnings - commission };
}
