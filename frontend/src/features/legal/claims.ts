// Every published company figure lives here once, with its date and meaning; pages read from this file only.

export type Claim = {
  display: string;
  value?: number;
  label: string;
  asOf: string;
  kind: 'reported' | 'forecast' | 'example';
};

export const CLAIMS = {
  revenue2026: { display: '$900,627', value: 900_627, label: '2026 revenue to date', asOf: '2026-11-18', kind: 'reported' },
  revenue2025: { display: '$307K', value: 307_000, label: '2025 revenue', asOf: '2025-12-31', kind: 'reported' },
  revenue2023: { display: '$1,574', value: 1_574, label: '2023 revenue', asOf: '2023-12-31', kind: 'reported' },
  target2026: { display: '$1.2M', value: 1_200_000, label: '2026 full-year forecast', asOf: '2026-11-18', kind: 'forecast' },
  pipeline: { display: '$78,734', value: 78_734, label: 'Upcoming bookings', asOf: '2026-11-18', kind: 'reported' },
  goal700: { display: '$10.08M', value: 10_080_000, label: '700-vehicle revenue goal', asOf: '2026-11-18', kind: 'forecast' },
  fleet: { display: '100+', value: 100, label: 'Vehicles managed', asOf: '2026-09-30', kind: 'reported' },
  fleet2025: { display: '72', value: 72, label: 'Vehicles managed in 2025', asOf: '2025-12-31', kind: 'reported' },
  trips: { display: '5,100+', value: 5_100, label: 'Completed trips', asOf: '2026-09-30', kind: 'reported' },
  rating: { display: '4.96★', value: 4.96, label: 'Turo rating, 2,053 reviews, All-Star Host', asOf: '2026-09-12', kind: 'reported' },
  dailyRate: { display: '$65–$120', label: 'Daily rate range, 2025 fleet bookings', asOf: '2025-12-31', kind: 'example' },
  bookedDays: { display: '21–24', label: 'Booked days a month (70–80%) in the examples', asOf: '2025-12-31', kind: 'example' },
} as const satisfies Record<string, Claim>;

export const OWNER_COSTS = { managementFeePct: 20, insuranceCents: 13_700, detailingCents: 5_000 } as const;

// Monthly gross per example car; the net is worked out below so the table and the headline can never disagree.
export const OWNER_EXAMPLES = [
  { tier: 'Conservative', vehicles: 'Kia Sportage, Buick Envista', grossCents: 152_000, tone: 'default' as const },
  { tier: 'Mid-range', vehicles: 'VW Tiguan, Jeep Grand Cherokee', grossCents: 198_375, tone: 'primary' as const },
  { tier: 'Top performer', vehicles: 'VW Atlas, Nissan Pathfinder', grossCents: 253_500, tone: 'success' as const },
] as const;

export const EXAMPLES_PERIOD = '2025';

export function ownerBreakdown(grossCents: number) {
  const feeCents = Math.round((grossCents * OWNER_COSTS.managementFeePct) / 100);
  const netCents = grossCents - feeCents - OWNER_COSTS.insuranceCents - OWNER_COSTS.detailingCents;
  return { grossCents, feeCents, insuranceCents: OWNER_COSTS.insuranceCents, detailingCents: OWNER_COSTS.detailingCents, netCents };
}

export const usd = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;

const nets = OWNER_EXAMPLES.map((e) => ownerBreakdown(e.grossCents).netCents);
export const OWNER_NET_RANGE = `${usd(Math.min(...nets))}–${usd(Math.max(...nets))}`;

export function asOfDate(c: Claim): string {
  return new Date(`${c.asOf}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function claimNote(c: Claim): string {
  if (c.kind === 'forecast') return `Management forecast as of ${asOfDate(c)}, not earned revenue`;
  if (c.kind === 'example') return `Example from ${EXAMPLES_PERIOD} fleet data, not typical or guaranteed`;
  return `Company-reported, unaudited, as of ${asOfDate(c)}`;
}
