import type { Vehicle } from '@/features/vehicles/types';

export type PricingField = 'daily' | 'weekly' | 'monthly';

export interface SeasonalRuleForm { label: string; start: string; end: string; pct: string }

export interface PricingForm {
  daily: string;
  weekend: string;
  weekly: string;
  monthly: string;
  earlyBird: string;
  lastMinute: string;
  rules: SeasonalRuleForm[];
}

const pctFromBps = (bps?: number) => String(bps ? Math.round(bps / 100) : 0);
const upliftFromBps = (bps?: number) => String(bps ? Math.round((bps - 10000) / 100) : 0);
const num = (s: string) => Number(s) || 0;
// Basis points must be whole numbers: 7.25% is 725, never 724.9999.
const bps = (pct: number, max: number) => Math.round(Math.min(max, Math.max(0, pct)) * 100);

export const NEW_SEASONAL_RULE: SeasonalRuleForm = { label: '', start: '', end: '', pct: '150' };

/** The car's pricing as editable percentages and dollars. */
export function pricingForm(p: Vehicle['pricing']): PricingForm {
  return {
    daily: String(p.dailyPrice / 100),
    weekend: upliftFromBps(p.weekendMultiplierBps),
    weekly: pctFromBps(p.weeklyDiscountBps),
    monthly: pctFromBps(p.monthlyDiscountBps),
    earlyBird: pctFromBps(p.earlyBirdBps),
    lastMinute: pctFromBps(p.lastMinuteBps),
    rules: (p.seasonalRules ?? []).map((r) => ({
      label: r.label,
      start: r.start.slice(0, 10),
      end: r.end.slice(0, 10),
      pct: String(Math.round(r.multiplierBps / 100)),
    })),
  };
}

export const pricingValid = (f: PricingForm) => !!f.daily && num(f.daily) > 0;

/** The PATCH body for the car's pricing, clamped to the server's limits. */
export function pricingPatch(f: PricingForm): Record<string, unknown> {
  return {
    dailyPrice: Math.round(num(f.daily) * 100),
    weekendMultiplierBps: 10000 + bps(num(f.weekend), 1000),
    weeklyDiscountBps: bps(num(f.weekly), 90),
    monthlyDiscountBps: bps(num(f.monthly), 90),
    earlyBirdBps: bps(num(f.earlyBird), 50),
    lastMinuteBps: bps(num(f.lastMinute), 50),
    seasonalRules: f.rules
      .filter((r) => r.label.trim() && r.start && r.end)
      .map((r) => ({
        label: r.label.trim(),
        start: r.start,
        end: r.end,
        multiplierBps: Math.round(Math.min(300, Math.max(10, num(r.pct))) * 100),
      })),
  };
}

/** Which pricing lever a trip-length card opens. */
export const fieldForDays = (days: number): PricingField => (days >= 28 ? 'monthly' : days >= 7 ? 'weekly' : 'daily');

/** Where the base rate lands against the market's comps, 1 (pricey) to 4 (very competitive); 0 while unknown. */
export function competitiveness(dailyPrice: number, comps?: { p25: number; median: number; p75: number }): number {
  if (!comps) return 0;
  if (dailyPrice <= comps.p25) return 4;
  if (dailyPrice <= comps.median) return 3;
  if (dailyPrice <= comps.p75) return 2;
  return 1;
}

/** The hint under the editor for the lever it opened on. */
export const PRICING_FIELD_HINT: Record<PricingField, string> = {
  daily: '1- and 3-day earnings follow your daily price.',
  weekly: '7-day earnings follow your weekly discount.',
  monthly: '28-day earnings follow your monthly discount.',
};
