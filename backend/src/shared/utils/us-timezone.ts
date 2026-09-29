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
