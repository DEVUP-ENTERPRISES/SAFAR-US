import {
  money, zeroMoney, addMoney, subMoney, mulMoney, applyBps, sumMoney, type Money,
} from './money';

/**
 * Money maths.
 *
 * These are the cheapest tests in the codebase and guard the most expensive
 * mistakes: everything a guest is charged and everything a host is paid passes
 * through here, and a rounding error is invisible until it is thousands of
 * transactions deep.
 */
describe('money', () => {
  const usd = (n: number): Money => ({ amount: n, currency: 'USD' });

  it('stores integer minor units and never a float', () => {
    // 65.4 cents is not a thing. Anything fractional must land on an integer.
    expect(money(6540.4).amount).toBe(6540);
    expect(Number.isInteger(money(0.5).amount)).toBe(true);
  });

  it('refuses to mix currencies rather than silently producing nonsense', () => {
    // The dangerous alternative is adding 100 USD to 100 INR and getting 200
    // of something. Throwing is the only safe answer.
    expect(() => addMoney(usd(100), { amount: 100, currency: 'INR' })).toThrow(/Currency mismatch/);
    expect(() => subMoney(usd(100), { amount: 100, currency: 'EUR' })).toThrow(/Currency mismatch/);
  });

  describe('applyBps', () => {
    it('computes a commission exactly', () => {
      // 20% of $65.00
      expect(applyBps(usd(6500), 2000)).toEqual(usd(1300));
    });

    it('rounds to whole cents rather than carrying a fraction', () => {
      // 7.5% of $10.01 = 75.075 cents.
      expect(applyBps(usd(1001), 750).amount).toBe(75);
    });

    it('is exact at the boundaries', () => {
      expect(applyBps(usd(6500), 10_000)).toEqual(usd(6500)); // 100%
      expect(applyBps(usd(6500), 0)).toEqual(usd(0));
    });

    it('never loses a cent to floating point on a realistic total', () => {
      // 0.1 + 0.2 territory: done in floats this drifts, in integers it cannot.
      const total = usd(29_999); // $299.99
      const commission = applyBps(total, 2000);
      const hostShare = subMoney(total, commission);
      expect(addMoney(commission, hostShare)).toEqual(total);
    });
  });

  it('splits a total without leaking value', () => {
    // The property that matters: the parts always reassemble into the whole.
    for (const amount of [1, 7, 99, 100, 6500, 12_345, 999_999]) {
      const total = usd(amount);
      const commission = applyBps(total, 1750);
      expect(addMoney(commission, subMoney(total, commission))).toEqual(total);
    }
  });

  it('sums an empty list to zero rather than undefined', () => {
    expect(sumMoney([])).toEqual(zeroMoney());
  });

  it('multiplies by a day count exactly', () => {
    expect(mulMoney(usd(6500), 3)).toEqual(usd(19_500));
  });

  it('handles a zero-amount booking without dividing by anything', () => {
    expect(applyBps(usd(0), 2000)).toEqual(usd(0));
  });
});
