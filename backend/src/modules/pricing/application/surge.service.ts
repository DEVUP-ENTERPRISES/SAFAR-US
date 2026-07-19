import { SurgeRuleModel, SURGE_SPECIFICITY, type SurgeRuleDoc } from '../infrastructure/surge-rule.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { kv } from '../../../infrastructure/cache/kv-store';
import { ValidationError } from '../../../core/errors/app-error';

const RULES_KEY = 'surge:rules';
const RULES_TTL = 300;
const OCC_TTL = 120; // occupancy is expensive; 2 min is fresh enough for pricing

export interface SurgeContext {
  city?: string;
  category?: string;
  /** The calendar day being priced. */
  day: Date;
}

export interface ResolvedSurge {
  multiplierBps: number; // 10000 = 1.0x
  source: string; // 'none' | 'auto:occupancy' | 'city:Miami' | …
}

/**
 * Demand pricing for a rental marketplace.
 *
 * Two independent sources, the higher of which wins (capped by config):
 *   1. MANUAL rules  — "Miami, this holiday weekend, 1.4x" (set by ops)
 *   2. AUTO surge    — derived from REAL occupancy: if 85% of a city's cars are
 *                      already booked that day, demand is genuinely outstripping
 *                      supply and the curve lifts the price.
 *
 * Auto-surge reads live booking data — no hardcoded demand assumptions.
 */
export class SurgeService {
  /** Resolve the multiplier for one calendar day. 10000 = no surge. */
  async resolve(ctx: SurgeContext): Promise<ResolvedSurge> {
    const cfg = await platformConfigService.get();
    if (!cfg.surge.enabled) return { multiplierBps: 10000, source: 'disabled' };

    const [manual, auto] = await Promise.all([
      this.resolveManual(ctx),
      cfg.surge.autoEnabled ? this.resolveAuto(ctx) : Promise.resolve<ResolvedSurge | null>(null),
    ]);

    const candidates = [manual, auto].filter((x): x is ResolvedSurge => !!x);
    if (candidates.length === 0) return { multiplierBps: 10000, source: 'none' };

    // The strongest signal wins, then we clamp to the configured ceiling so a
    // bad rule (or a freak occupancy spike) can never 5x a customer.
    const win = candidates.reduce((a, b) => (b.multiplierBps > a.multiplierBps ? b : a));
    const capped = Math.min(win.multiplierBps, cfg.surge.maxMultiplierBps);
    return {
      multiplierBps: Math.max(10000, capped),
      source: capped < win.multiplierBps ? `${win.source} (capped)` : win.source,
    };
  }

  private async resolveManual(ctx: SurgeContext): Promise<ResolvedSurge | null> {
    const rules = await this.activeRules();
    const t = +ctx.day;
    const dow = ctx.day.getUTCDay();

    const matches = rules.filter((r) => {
      if (r.effectiveFrom && t < +new Date(r.effectiveFrom)) return false;
      if (r.effectiveTo && t > +new Date(r.effectiveTo)) return false;
      if (r.daysOfWeek.length > 0 && !r.daysOfWeek.includes(dow)) return false;
      switch (r.scope) {
        case 'global':
          return true;
        case 'city':
          return !!ctx.city && r.city === ctx.city;
        case 'category':
          return !!ctx.category && r.category === ctx.category;
        case 'cityCategory':
          return !!ctx.city && !!ctx.category && r.city === ctx.city && r.category === ctx.category;
        default:
          return false;
      }
    });
    if (matches.length === 0) return null;

    matches.sort(
      (a, b) =>
        SURGE_SPECIFICITY[b.scope] - SURGE_SPECIFICITY[a.scope] ||
        b.priority - a.priority ||
        b.multiplierBps - a.multiplierBps,
    );
    const win = matches[0];
    const label = win.scope === 'global' ? 'global' : `${win.city ?? ''}${win.category ? `/${win.category}` : ''}`;
    return { multiplierBps: win.multiplierBps, source: `rule:${label || win.scope}` };
  }

  /**
   * Auto-surge from measured occupancy: what fraction of that city's listed
   * cars are already booked on this day? Mapped through the admin's threshold
   * curve (also config, not code).
   */
  private async resolveAuto(ctx: SurgeContext): Promise<ResolvedSurge | null> {
    if (!ctx.city) return null;
    const cfg = await platformConfigService.get();
    const thresholds = [...cfg.surge.occupancyThresholds].sort((a, b) => b.occupancyPct - a.occupancyPct);
    if (thresholds.length === 0) return null;

    const occupancy = await this.occupancyFor(ctx.city, ctx.day);
    if (occupancy == null) return null;

    const hit = thresholds.find((t) => occupancy >= t.occupancyPct);
    if (!hit) return null;
    return {
      multiplierBps: hit.multiplierBps,
      source: `auto:occupancy ${Math.round(occupancy)}%`,
    };
  }

  /** % of a city's listed cars that are booked on `day`. Null if no supply. */
  async occupancyFor(city: string, day: Date): Promise<number | null> {
    const dayKey = day.toISOString().slice(0, 10);
    const cacheKey = `surge:occ:${city}:${dayKey}`;
    const cached = await kv().get(cacheKey);
    if (cached) return Number(cached);

    const supply = await VehicleModel.countDocuments({
      'location.city': city,
      status: 'listed',
      verificationStatus: 'verified',
      deletedAt: null,
    });
    if (supply === 0) return null;

    const dayStart = new Date(`${dayKey}T00:00:00.000Z`);
    const dayEnd = new Date(`${dayKey}T23:59:59.999Z`);

    // Vehicles in this city with a live booking overlapping the day.
    const cityVehicles = await VehicleModel.find({ 'location.city': city, deletedAt: null })
      .select('_id')
      .lean<{ _id: string }[]>();
    const booked = await BookingModel.countDocuments({
      vehicleId: { $in: cityVehicles.map((v) => v._id) },
      status: { $in: ['confirmed', 'paid', 'in_progress'] },
      'period.start': { $lte: dayEnd },
      'period.end': { $gte: dayStart },
    });

    const pct = Math.min(100, (booked / supply) * 100);
    await kv().set(cacheKey, String(pct), OCC_TTL);
    return pct;
  }

  // ── Admin CRUD ──────────────────────────────────────────────────────

  async listRules(): Promise<SurgeRuleDoc[]> {
    return SurgeRuleModel.find().sort({ active: -1, priority: -1, createdAt: -1 }).lean<SurgeRuleDoc[]>();
  }

  async createRule(input: Partial<SurgeRuleDoc>, actorId: string): Promise<SurgeRuleDoc> {
    const cfg = await platformConfigService.get();
    const m = input.multiplierBps ?? 10000;
    if (m < 10000) throw new ValidationError('Surge multiplier cannot be below 1.0x');
    if (m > cfg.surge.maxMultiplierBps) {
      throw new ValidationError(`Surge cannot exceed the ${(cfg.surge.maxMultiplierBps / 10000).toFixed(2)}x ceiling`);
    }
    if ((input.scope === 'city' || input.scope === 'cityCategory') && !input.city) {
      throw new ValidationError('A city-scoped rule needs a city');
    }
    if ((input.scope === 'category' || input.scope === 'cityCategory') && !input.category) {
      throw new ValidationError('A category-scoped rule needs a category');
    }
    const rule = await SurgeRuleModel.create({ ...input, createdBy: actorId });
    await this.invalidate();
    return rule.toObject();
  }

  async updateRule(id: string, patch: Partial<SurgeRuleDoc>): Promise<SurgeRuleDoc> {
    const rule = await SurgeRuleModel.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean<SurgeRuleDoc>();
    if (!rule) throw new ValidationError('Surge rule not found');
    await this.invalidate();
    return rule;
  }

  async deleteRule(id: string): Promise<void> {
    await SurgeRuleModel.deleteOne({ _id: id });
    await this.invalidate();
  }

  private async activeRules(): Promise<SurgeRuleDoc[]> {
    const cached = await kv().get(RULES_KEY);
    if (cached) return JSON.parse(cached) as SurgeRuleDoc[];
    const rules = await SurgeRuleModel.find({ active: true }).lean<SurgeRuleDoc[]>();
    await kv().set(RULES_KEY, JSON.stringify(rules), RULES_TTL);
    return rules;
  }

  private async invalidate(): Promise<void> {
    await kv().del(RULES_KEY);
  }
}

export const surgeService = new SurgeService();
