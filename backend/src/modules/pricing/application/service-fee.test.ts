import { computeServiceFee } from './pricing.service';
import { money } from '../../../core/types/money';

const trip = money(20_000, 'USD');

describe('computeServiceFee', () => {
  it('charges the flat $2.50 on a new booking even when the percent is zero', () => {
    expect(computeServiceFee(trip, { bps: 0, maxCents: 0, flatCents: 250 }, true).amount).toBe(250);
  });
  it('adds the flat amount to the percent', () => {
    expect(computeServiceFee(trip, { bps: 350, maxCents: 0, flatCents: 250 }, true).amount).toBe(950);
  });
  it('does not charge the flat amount again on an extension', () => {
    expect(computeServiceFee(trip, { bps: 0, maxCents: 0, flatCents: 250 }, false).amount).toBe(0);
  });
  it('never exceeds the cap, and is off when everything is zero', () => {
    expect(computeServiceFee(trip, { bps: 350, maxCents: 500, flatCents: 250 }, true).amount).toBe(500);
    expect(computeServiceFee(trip, { bps: 0, maxCents: 0, flatCents: 0 }, true).amount).toBe(0);
  });
});
