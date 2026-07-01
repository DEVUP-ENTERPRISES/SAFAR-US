/**
 * Money is ALWAYS integer minor units (paise/cents) + ISO currency.
 * Never a float. All arithmetic stays in integers to avoid rounding drift.
 */
export interface Money {
  amount: number; // minor units, e.g. 150000 = ₹1,500.00
  currency: string; // ISO 4217, e.g. "INR"
}

export const DEFAULT_CURRENCY = 'INR';

export function money(amount: number, currency: string = DEFAULT_CURRENCY): Money {
  return { amount: Math.round(amount), currency };
}

export function zeroMoney(currency: string = DEFAULT_CURRENCY): Money {
  return { amount: 0, currency };
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount + b.amount, currency: a.currency };
}

export function subMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount - b.amount, currency: a.currency };
}

export function mulMoney(a: Money, factor: number): Money {
  return { amount: Math.round(a.amount * factor), currency: a.currency };
}

/** Apply basis points (1% = 100 bps). */
export function applyBps(a: Money, bps: number): Money {
  return { amount: Math.round((a.amount * bps) / 10_000), currency: a.currency };
}

export function sumMoney(items: Money[], currency: string = DEFAULT_CURRENCY): Money {
  return items.reduce((acc, m) => addMoney(acc, m), zeroMoney(currency));
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}
