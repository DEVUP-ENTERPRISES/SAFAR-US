import { cancellationNotice } from './refund-notice';
import { computeRefund, explainRefund, type CancellationRules } from './cancellation-policy';

const rules: CancellationRules = {
  flexible: { fullBeforeHours: 24, partialBps: 5000 },
  moderate: { fullBeforeHours: 48, partialBps: 5000 },
  strict: { fullBeforeHours: 168, partialBps: 0 },
};
const total = { amount: 20_250, currency: 'USD' };
const start = new Date('2026-11-01T10:00:00Z');
const at = (hoursBefore: number) => new Date(start.getTime() - hoursBefore * 3_600_000);

describe('explainRefund', () => {
  it('gives the same refund as before, with the rule behind it', () => {
    for (const h of [200, 30, 10, 0.5]) {
      for (const p of ['flexible', 'moderate', 'strict'] as const) {
        expect(explainRefund(p, total, start, rules, at(h), 250).refund).toEqual(computeRefund(p, total, start, rules, at(h), 250));
      }
    }
    expect(explainRefund('flexible', total, start, rules, at(10), 250)).toMatchObject({ kind: 'partial', partialPct: 50, fullBeforeHours: 24, feeKept: 250, refund: { amount: 10_000 } });
    expect(explainRefund('flexible', total, start, rules, at(30), 250)).toMatchObject({ kind: 'full', feeKept: 0, refund: { amount: 20_250 } });
    expect(explainRefund('strict', total, start, rules, at(30), 250)).toMatchObject({ kind: 'none', refund: { amount: 0 } });
  });
});

describe('cancellationNotice', () => {
  it('explains a late guest cancellation: the rule, the fee, what comes back and where', () => {
    const explained = explainRefund('flexible', total, start, rules, at(10), 250);
    const n = cancellationNotice({ cancelledBy: 'guest', currency: 'USD', refunded: 10_000, kept: 10_250, explained, toCard: 8_000, toWallet: 2_000 });
    expect(n.title).toBe('Booking cancelled · $100.00 refunded');
    expect(n.body).toContain('You cancelled 10 hours before pickup');
    expect(n.body).toContain('Flexible policy, cancelling less than 24 hours ahead refunds 50% of the trip');
    expect(n.body).toContain('The $2.50 service fee isn’t refunded');
    expect(n.body).toContain('refunding $100.00 and keeping $102.50');
    expect(n.body).toContain('$80.00 goes back to your card');
    expect(n.body).toContain('$20.00 is back in your CatoDrive wallet now');
    expect(n.facts).toEqual([
      { label: 'Refunded', value: '$100.00' },
      { label: 'Kept', value: '$102.50' },
      { label: 'To your card', value: '$80.00' },
      { label: 'To your wallet', value: '$20.00' },
    ]);
  });

  it('confirms a full refund for an early guest cancellation', () => {
    const explained = explainRefund('moderate', total, start, rules, at(72), 250);
    const n = cancellationNotice({ cancelledBy: 'guest', currency: 'USD', refunded: 20_250, kept: 0, explained, toCard: 20_250 });
    expect(n.title).toBe('Booking cancelled · $202.50 refunded');
    expect(n.body).toContain('You cancelled 3 days before pickup, at least 2 days ahead');
    expect(n.facts?.map((f) => f.label)).toEqual(['Refunded', 'To your card']);
  });

  it('says plainly when nothing comes back', () => {
    const explained = explainRefund('strict', total, start, rules, at(30), 250);
    const n = cancellationNotice({ cancelledBy: 'guest', currency: 'USD', refunded: 0, kept: 20_250, explained });
    expect(n.title).toBe('Booking cancelled · no refund');
    expect(n.body).toContain('Strict policy, cancelling less than 7 days ahead isn’t refundable, so we’ve kept $202.50');
  });

  it('gives a full refund when the host or CatoDrive cancels, even without a kept figure', () => {
    expect(cancellationNotice({ cancelledBy: 'host', currency: 'USD', refunded: 20_250, kept: 0, toCard: 20_250 }).body).toMatch(/^Your host cancelled your booking, so you get a full refund of \$202\.50/);
    const system = cancellationNotice({ cancelledBy: 'system', currency: 'USD', refunded: 20_250 });
    expect(system.title).toBe('Booking cancelled · $202.50 refunded');
    expect(system.body).toContain('CatoDrive cancelled your booking');
    expect(system.body).not.toContain('haven’t been charged');
  });

  it('tells an unpaid guest the card hold is released', () => {
    expect(cancellationNotice({ cancelledBy: 'guest', refunded: 0, kept: 0 }).body).toContain('You haven’t been charged');
    expect(cancellationNotice({ cancelledBy: 'system', refunded: 0 }).body).toContain('You haven’t been charged');
  });
});
