// Same bounds the API enforces in backend asset-partners/dto/partner-terms.schemas.ts.
export type TermField = 'managementFeeBps' | 'insuranceMonthlyCents' | 'detailingMonthlyCents' | 'deductibleCapCents' | 'maintenanceApprovalCents' | 'payoutDayOfMonth';

type Limit = { min: number; max: number; unit: 'percent' | 'usd' | 'day'; label: string };

export const TERM_LIMITS: Record<TermField, Limit> = {
  managementFeeBps: { min: 0, max: 5_000, unit: 'percent', label: 'Management fee' },
  insuranceMonthlyCents: { min: 0, max: 200_000, unit: 'usd', label: 'Insurance' },
  detailingMonthlyCents: { min: 0, max: 100_000, unit: 'usd', label: 'Detailing' },
  deductibleCapCents: { min: 0, max: 2_500_000, unit: 'usd', label: 'Deductible cap' },
  maintenanceApprovalCents: { min: 0, max: 1_000_000, unit: 'usd', label: 'Maintenance approval' },
  payoutDayOfMonth: { min: 1, max: 28, unit: 'day', label: 'Payout day' },
};

const shown = (f: TermField, stored: number) => (TERM_LIMITS[f].unit === 'day' ? stored : stored / 100);

export function termRangeText(f: TermField): string {
  const l = TERM_LIMITS[f];
  if (l.unit === 'percent') return `${shown(f, l.min)}–${shown(f, l.max)}%`;
  if (l.unit === 'day') return `day ${l.min}–${l.max}`;
  return `$${shown(f, l.min).toLocaleString('en-US')}–$${shown(f, l.max).toLocaleString('en-US')}`;
}

// Keeps only what the field can hold: digits, and for money or percent one dot with two decimals.
export function cleanTermInput(f: TermField, raw: string): string {
  if (TERM_LIMITS[f].unit === 'day') return raw.replace(/\D/g, '').slice(0, 2);
  const digits = raw.replace(/[^\d.]/g, '');
  const [whole, ...rest] = digits.split('.');
  const out = rest.length ? `${whole.slice(0, 7)}.${rest.join('').slice(0, 2)}` : whole.slice(0, 7);
  return out;
}

// The value to send (bps, cents or day), or an error sentence; empty input means "use the default".
export function parseTerm(f: TermField, raw: string): { value?: number; error?: string } {
  const t = raw.trim();
  if (t === '') return {};
  const n = Number(t);
  const l = TERM_LIMITS[f];
  if (!Number.isFinite(n)) return { error: `Enter a number, ${termRangeText(f)}.` };
  const stored = l.unit === 'day' ? n : Math.round(n * 100);
  if (l.unit === 'day' && !Number.isInteger(n)) return { error: `Use a whole day, ${termRangeText(f)}.` };
  if (stored < l.min || stored > l.max) return { error: `${l.label} must be ${termRangeText(f)}.` };
  return { value: stored };
}

// Keeps a stored value (bps, cents or day) inside its bounds; anything unreadable falls to the minimum.
export function clampTerm(f: TermField, stored: number): number {
  const l = TERM_LIMITS[f];
  return Number.isFinite(stored) ? Math.min(l.max, Math.max(l.min, Math.round(stored))) : l.min;
}
