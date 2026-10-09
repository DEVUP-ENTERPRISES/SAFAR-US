import { endOfUsDay, localCalendarDay } from './us-timezone';

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
