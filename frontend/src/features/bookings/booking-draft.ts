'use client';

/**
 * What the guest had chosen before we sent them to sign in.
 *
 * The vehicle page redirected to /login with a `next` back to the same car and
 * a comment saying this avoided "dropping them on search having lost their
 * dates and options". It preserved the URL and nothing else: every field on
 * that page is component state, so returning from login remounted it empty.
 * Dates, protection plan, add-ons, delivery address, flight, coupon — all of
 * it had to be entered a second time, at the exact moment someone has already
 * decided to pay.
 *
 * sessionStorage rather than localStorage on purpose: this is one tab finishing
 * one errand. It should not still be waiting on a different machine tomorrow,
 * and it must not leak a guest's plans into the next person to use the browser.
 */

const KEY = 'cato.booking-draft';

export interface BookingDraft {
  vehicleId: string;
  start: string;
  end: string;
  addOnCodes: string[];
  protectionPlan: string;
  payWithWallet: boolean;
  deliveryMode: string;
  deliveryAddress: string;
  flightNumber: string;
  terminal: string;
  arrivesAt: string;
  couponCode: string;
  /** Drafts older than this are stale intent, not a resumable checkout. */
  savedAt: number;
}

const MAX_AGE_MS = 60 * 60 * 1000;

export function saveDraft(draft: Omit<BookingDraft, 'savedAt'>): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    /* storage unavailable — the guest re-enters, which is today's behaviour */
  }
}

/**
 * Returns the draft only if it belongs to this car and is still fresh, and
 * clears it either way — restoring is a one-shot, or a back button would keep
 * re-filling a form the guest has since changed.
 */
export function takeDraft(vehicleId: string): BookingDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);

    const d: unknown = JSON.parse(raw);
    if (!d || typeof d !== 'object') return null;
    const draft = d as BookingDraft;
    if (draft.vehicleId !== vehicleId) return null;
    if (!draft.savedAt || Date.now() - draft.savedAt > MAX_AGE_MS) return null;
    return draft;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
