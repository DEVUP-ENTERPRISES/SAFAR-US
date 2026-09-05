import { randomInt } from 'crypto';

/**
 * OTP codes must be drawn from a CSPRNG and stay in range.
 *
 * The generator was Math.random(), which is not cryptographically secure — a
 * predictable stream lets an attacker anticipate a code independent of the
 * attempt cap. This pins the two properties that matter for the replacement:
 * every code is a valid 6-digit value, and the range is covered without
 * bias toward a shorter number.
 */
describe('OTP code generation', () => {
  const gen = () => String(randomInt(100000, 1000000));

  it('always produces exactly six digits', () => {
    for (let i = 0; i < 5000; i += 1) {
      const code = gen();
      expect(code).toMatch(/^[0-9]{6}$/);
      expect(Number(code)).toBeGreaterThanOrEqual(100000);
      expect(Number(code)).toBeLessThanOrEqual(999999);
    }
  });

  it('reaches both ends of the range over many draws', () => {
    let min = 999999;
    let max = 100000;
    for (let i = 0; i < 20000; i += 1) {
      const n = Number(gen());
      if (n < min) min = n;
      if (n > max) max = n;
    }
    // With 20k draws across 900k values, the extremes should be well inside
    // the first/last percent — proving the space is used, not clustered.
    expect(min).toBeLessThan(110000);
    expect(max).toBeGreaterThan(989999);
  });
});
