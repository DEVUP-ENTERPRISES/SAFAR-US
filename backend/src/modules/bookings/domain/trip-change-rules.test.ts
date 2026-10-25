import { undoWindowEndsAt, inUndoWindow, creditBonus, pickupShiftChoices, scaleSplit } from './trip-change-rules';

const H = 3_600_000;
const rules = { undoWindowMinutes: 10, undoMinLeadHours: 2, undoPer30Days: 2 };

describe('undo window', () => {
  const createdAt = new Date('2031-01-01T10:00:00Z');

  it('closes the configured minutes after booking', () => {
    const ends = undoWindowEndsAt({ createdAt, start: new Date(createdAt.getTime() + 48 * H) }, rules, 0);
    expect(ends?.toISOString()).toBe('2031-01-01T10:10:00.000Z');
  });

  it('is not offered when pickup is too close, so a car cannot be held for free', () => {
    expect(undoWindowEndsAt({ createdAt, start: new Date(createdAt.getTime() + 2 * H) }, rules, 0)).toBeNull();
  });

  it('stops after the guest used it the allowed number of times', () => {
    expect(undoWindowEndsAt({ createdAt, start: new Date(createdAt.getTime() + 48 * H) }, rules, 2)).toBeNull();
  });

  it('is off when set to 0 minutes', () => {
    expect(undoWindowEndsAt({ createdAt, start: new Date(createdAt.getTime() + 48 * H) }, { ...rules, undoWindowMinutes: 0 }, 0)).toBeNull();
  });

  it('allows a tap that lands a few seconds late, not a minute late', () => {
    const ends = new Date('2031-01-01T10:10:00Z');
    expect(inUndoWindow(ends, new Date('2031-01-01T10:10:20Z'))).toBe(true);
    expect(inUndoWindow(ends, new Date('2031-01-01T10:11:00Z'))).toBe(false);
    expect(inUndoWindow(null)).toBe(false);
  });
});

describe('credit bonus', () => {
  it('pays the configured share in whole cents', () => {
    expect(creditBonus(5_001, 2_000)).toBe(1_000);
  });
  it('is zero with nothing refunded or no bonus', () => {
    expect(creditBonus(0, 2_000)).toBe(0);
    expect(creditBonus(5_000, 0)).toBe(0);
  });
});

describe('pickup shift choices', () => {
  const start = new Date('2031-01-01T10:00:00Z');

  it('offers each whole hour up to the limit', () => {
    const end = new Date(start.getTime() + 48 * H);
    expect(pickupShiftChoices(start, end, 3, 4).map((d) => d.toISOString())).toEqual([
      '2031-01-01T11:00:00.000Z',
      '2031-01-01T12:00:00.000Z',
      '2031-01-01T13:00:00.000Z',
    ]);
  });

  it('never leaves a trip shorter than the car minimum', () => {
    const end = new Date(start.getTime() + 6 * H);
    expect(pickupShiftChoices(start, end, 3, 4)).toHaveLength(2);
    expect(pickupShiftChoices(start, end, 3, 6)).toHaveLength(0);
  });
});

describe('scaleSplit', () => {
  it('keeps the same shares and always sums to the new total', () => {
    const out = scaleSplit({ hostEarnings: 8_000, commission: 1_500, tax: 500 }, 10_000, 3_333);
    expect(out.hostEarnings + out.commission + out.tax).toBe(3_333);
    expect(out.hostEarnings).toBe(2_666);
  });
});
