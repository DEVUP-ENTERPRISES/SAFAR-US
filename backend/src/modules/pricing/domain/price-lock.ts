import { createHmac, timingSafeEqual } from 'crypto';
import { config } from '../../../config';
import type { PriceBreakdown } from '../../../core/contracts/pricing.contract';

/** How long a quoted price is honoured. */
export const PRICE_LOCK_TTL_MS = 10 * 60 * 1000;

export interface PriceLock {
  /** Everything the price depended on — changing any of it invalidates it. */
  vehicleId: string;
  guestId: string;
  start: string;
  end: string;
  total: number;
  currency: string;
  /** Epoch ms. */
  expiresAt: number;
  signature: string;
}

/**
 * A signed, short-lived promise that the price on the screen is the price
 * charged.
 *
 * Without this the quote is recomputed at booking time, so a surge rule
 * activating in the seconds between "see price" and "confirm" silently charges
 * the guest more than they agreed to. That is the single most corrosive trust
 * failure a marketplace can have, and it is invisible in testing because the
 * window is small.
 *
 * Signed rather than stored: it needs no lookup, no cache eviction policy and
 * no cleanup job, and it cannot be tampered with client-side. The signature
 * covers the inputs AND the amount, so a client cannot resubmit the same lock
 * against different dates or a cheaper total.
 */
function payload(lock: Omit<PriceLock, 'signature'>): string {
  return [
    lock.vehicleId,
    lock.guestId,
    lock.start,
    lock.end,
    String(lock.total),
    lock.currency,
    String(lock.expiresAt),
  ].join('|');
}

function sign(data: string): string {
  // Reuses the access-token secret: same trust domain, same rotation story.
  return createHmac('sha256', config.jwt.accessSecret).update(data).digest('hex');
}

export function issuePriceLock(input: {
  vehicleId: string;
  guestId: string;
  start: Date;
  end: Date;
  breakdown: PriceBreakdown;
  /** How long the quote is honoured. Injected by the service from
   *  PlatformConfig; the default keeps this function pure and testable. */
  ttlMs?: number;
}): PriceLock {
  const base = {
    vehicleId: input.vehicleId,
    guestId: input.guestId,
    start: input.start.toISOString(),
    end: input.end.toISOString(),
    total: input.breakdown.total.amount,
    currency: input.breakdown.total.currency,
    expiresAt: Date.now() + (input.ttlMs ?? PRICE_LOCK_TTL_MS),
  };
  return { ...base, signature: sign(payload(base)) };
}

export type LockFailure = 'malformed' | 'bad_signature' | 'expired' | 'mismatch';

/**
 * Is this lock genuine, unexpired, and for exactly this booking?
 *
 * Returns a reason rather than a boolean so the caller can tell an expired
 * quote (re-quote and show the new price) apart from a tampered one (refuse,
 * and treat as an attack).
 */
export function verifyPriceLock(
  lock: PriceLock | undefined,
  expected: { vehicleId: string; guestId: string; start: Date; end: Date },
): { ok: true } | { ok: false; reason: LockFailure } {
  if (!lock || typeof lock.signature !== 'string' || typeof lock.expiresAt !== 'number') {
    return { ok: false, reason: 'malformed' };
  }

  const expectedSig = sign(payload({ ...lock } as Omit<PriceLock, 'signature'>));
  const a = Buffer.from(lock.signature, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  // Constant-time: a length check alone leaks nothing, but the compare must
  // not short-circuit on the first differing byte.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_signature' };
  }

  if (Date.now() > lock.expiresAt) return { ok: false, reason: 'expired' };

  if (
    lock.vehicleId !== expected.vehicleId ||
    lock.guestId !== expected.guestId ||
    lock.start !== expected.start.toISOString() ||
    lock.end !== expected.end.toISOString()
  ) {
    return { ok: false, reason: 'mismatch' };
  }

  return { ok: true };
}
