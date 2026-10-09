// Main time zone per US state; states split across zones use their most-populated one.
const EASTERN = ['CT', 'DC', 'DE', 'FL', 'GA', 'IN', 'KY', 'MA', 'MD', 'ME', 'MI', 'NC', 'NH', 'NJ', 'NY', 'OH', 'PA', 'RI', 'SC', 'VA', 'VT', 'WV'];
const CENTRAL = ['AL', 'AR', 'IA', 'IL', 'KS', 'LA', 'MN', 'MO', 'MS', 'ND', 'NE', 'OK', 'SD', 'TN', 'TX', 'WI'];
const MOUNTAIN = ['CO', 'ID', 'MT', 'NM', 'UT', 'WY'];
const PACIFIC = ['CA', 'NV', 'OR', 'WA'];

const ZONES: Record<string, string> = {
  ...Object.fromEntries(EASTERN.map((s) => [s, 'America/New_York'])),
  ...Object.fromEntries(CENTRAL.map((s) => [s, 'America/Chicago'])),
  ...Object.fromEntries(MOUNTAIN.map((s) => [s, 'America/Denver'])),
  ...Object.fromEntries(PACIFIC.map((s) => [s, 'America/Los_Angeles'])),
  AZ: 'America/Phoenix',
  AK: 'America/Anchorage',
  HI: 'Pacific/Honolulu',
  PR: 'America/Puerto_Rico',
};

export function timezoneForState(state?: string): string | undefined {
  return state ? ZONES[state.toUpperCase()] : undefined;
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The calendar day `d` falls on in `timeZone`, as midnight UTC of that date. */
export function localCalendarDay(d: Date, timeZone: string): Date {
  const [y, m, day] = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(d)
    .split('-')
    .map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

/** The last moment of a calendar date anywhere in the US (Hawaii, UTC-10, finishes last). */
export function endOfUsDay(date: string): Date {
  return new Date(`${date}T23:59:59.999-10:00`);
}

/** The calendar date `d` falls on in `timeZone`, as YYYY-MM-DD. */
export function localDateKey(d: Date, timeZone: string): string {
  return localCalendarDay(d, timeZone).toISOString().slice(0, 10);
}

/** The instant a calendar date begins in `timeZone`. */
export function zonedMidnight(dateKey: string, timeZone: string): Date {
  const guess = Date.parse(`${dateKey}T00:00:00Z`);
  const offsetAt = (t: number) => {
    const p = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(new Date(t))
      .reduce<Record<string, number>>((a, x) => (x.type === 'literal' ? a : { ...a, [x.type]: Number(x.value) }), {});
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t;
  };
  const first = guess - offsetAt(guess);
  return new Date(guess - offsetAt(first));
}
