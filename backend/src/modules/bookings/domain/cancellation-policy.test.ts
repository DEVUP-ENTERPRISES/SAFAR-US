import { computeRefund } from './cancellation-policy';

/**
 * Refund maths.
 *
 * Every branch here is a real transfer of money between a guest and a host, and
 * an off-by-one on the boundary is the difference between a full refund and
 * nothing at all. The boundary cases are the point of this file.
 */
describe('computeRefund', () => {
  const usd = (n: number) => ({ amount: n, currency: 'USD' });
  const rules = {
    flexible: { fullBeforeHours: 24, partialBps: 5000 },
    moderate: { fullBeforeHours: 72, partialBps: 5000 },
    strict: { fullBeforeHours: 168, partialBps: 0 },
  };
  const now = new Date('2026-06-01T12:00:00Z');
  const hoursOut = (h: number) => new Date(now.getTime() + h * 3_600_000);

  it('refunds in full outside the window', () => {
    expect(computeRefund('flexible', usd(10_000), hoursOut(48), rules, now)).toEqual(usd(10_000));
  });

  it('refunds in full exactly ON the boundary', () => {
    // 24.000 hours out on a 24-hour policy. Inclusive, so a guest cancelling at
    // the stated deadline gets what the policy promised rather than half of it.
    expect(computeRefund('flexible', usd(10_000), hoursOut(24), rules, now)).toEqual(usd(10_000));
  });

  it('drops to partial one minute inside the boundary', () => {
    expect(computeRefund('flexible', usd(10_000), hoursOut(23.98), rules, now)).toEqual(usd(5_000));
  });

  it('refunds nothing under a strict policy inside its window', () => {
    // partialBps 0 means nothing back, not "fall through to something else".
    expect(computeRefund('strict', usd(10_000), hoursOut(1), rules, now)).toEqual(usd(0));
  });

  it('refunds in full under strict when far enough out', () => {
    expect(computeRefund('strict', usd(10_000), hoursOut(200), rules, now)).toEqual(usd(10_000));
  });

  it('treats a trip that already started as inside the window', () => {
    // Negative hours: cancelling after the start must never refund in full.
    expect(computeRefund('moderate', usd(10_000), hoursOut(-5), rules, now)).toEqual(usd(5_000));
  });

  it('rounds a partial refund to whole cents', () => {
    // 50% of $100.01
    expect(computeRefund('flexible', usd(10_001), hoursOut(1), rules, now).amount).toBe(5_001);
  });

  it('never refunds more than was paid', () => {
    for (const policy of ['flexible', 'moderate', 'strict'] as const) {
      for (const h of [-10, 0, 1, 23, 24, 71, 72, 167, 168, 500]) {
        const refund = computeRefund(policy, usd(10_000), hoursOut(h), rules, now);
        expect(refund.amount).toBeGreaterThanOrEqual(0);
        expect(refund.amount).toBeLessThanOrEqual(10_000);
      }
    }
  });

  it('preserves the currency it was given', () => {
    const inr = { amount: 50_000, currency: 'INR' };
    expect(computeRefund('flexible', inr, hoursOut(48), rules, now).currency).toBe('INR');
    expect(computeRefund('strict', inr, hoursOut(1), rules, now).currency).toBe('INR');
  });
});
