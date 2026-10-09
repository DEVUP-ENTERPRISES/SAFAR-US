import { endOfUsDay, localCalendarDay, localDateKey, zonedMidnight } from './us-timezone';

describe('localCalendarDay', () => {
  it('keeps a Friday-evening Texas pickup on Friday', () => {
    const fri8pm = new Date('2026-10-17T01:00:00Z');
    const day = localCalendarDay(fri8pm, 'America/Chicago');
    expect(day.toISOString()).toBe('2026-10-16T00:00:00.000Z');
    expect(day.getUTCDay()).toBe(5);
  });

  it('matches the UTC date when the zone is UTC', () => {
    expect(localCalendarDay(new Date('2026-10-17T01:00:00Z'), 'UTC').toISOString()).toBe('2026-10-17T00:00:00.000Z');
  });
});

describe('endOfUsDay', () => {
  it('lasts until the day is over in Hawaii', () => {
    expect(endOfUsDay('2026-10-15').toISOString()).toBe('2026-10-16T09:59:59.999Z');
  });
});

describe('zonedMidnight', () => {
  it('finds midnight in Texas during daylight time', () => {
    expect(zonedMidnight('2026-10-16', 'America/Chicago').toISOString()).toBe('2026-10-16T05:00:00.000Z');
  });
  it('finds midnight in Texas during standard time', () => {
    expect(zonedMidnight('2026-12-01', 'America/Chicago').toISOString()).toBe('2026-12-01T06:00:00.000Z');
  });
  it('handles the day clocks change', () => {
    expect(zonedMidnight('2026-11-01', 'America/Chicago').toISOString()).toBe('2026-11-01T05:00:00.000Z');
    expect(zonedMidnight('2026-11-02', 'America/Chicago').toISOString()).toBe('2026-11-02T06:00:00.000Z');
  });
  it('is plain midnight in UTC', () => {
    expect(zonedMidnight('2026-10-16', 'UTC').toISOString()).toBe('2026-10-16T00:00:00.000Z');
  });
});

describe('localDateKey', () => {
  it('gives the Texas date for an evening pickup', () => {
    expect(localDateKey(new Date('2026-10-17T01:00:00Z'), 'America/Chicago')).toBe('2026-10-16');
  });
});
