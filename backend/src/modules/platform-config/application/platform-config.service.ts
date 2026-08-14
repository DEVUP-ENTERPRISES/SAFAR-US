import { PlatformConfigModel, type PlatformConfigDoc } from '../infrastructure/platform-config.model';
import {
  CommissionRuleModel,
  SCOPE_SPECIFICITY,
  type CommissionRuleDoc,
  type CommissionScope,
} from '../infrastructure/commission-rule.model';
import { kv } from '../../../infrastructure/cache/kv-store';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { ValidationError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * The default loyalty ladder. Lives here rather than in the rewards module so
 * the config layer stays the single source of truth for platform economics —
 * rewards reads whatever is configured, and this is only the starting point.
 */
export const DEFAULT_REWARD_TIERS = [
  { key: 'bronze', label: 'Bronze', min: 0, earnMultiplierBps: 10000 },
  { key: 'silver', label: 'Silver', min: 500, earnMultiplierBps: 11000 },
  { key: 'gold', label: 'Gold', min: 2000, earnMultiplierBps: 12500 },
  { key: 'platinum', label: 'Platinum', min: 5000, earnMultiplierBps: 15000 },
];

const CONFIG_KEY = 'platform:config';
const RULES_KEY = 'platform:commission-rules';
const TTL = 300; // 5 min — a safety net; writes invalidate immediately.

export interface CommissionContext {
  hostId?: string;
  category?: string;
  /** e.g. 'superhost' — lets us reward top hosts with a lower take rate. */
  hostTier?: string;
}

export interface ResolvedCommission {
  bps: number;
  /** Which rule produced this rate — surfaced in the quote for auditability. */
  source: string;
  ruleId?: string;
}

/**
 * The single source of truth for platform economics. Nothing in the codebase
 * should hardcode a rate: every service asks this instead, so finance can
 * retune commission, fees and rewards live from the admin panel.
 *
 * Reads are cached in Redis and invalidated on every write, so a change is
 * hot — no deploy, no restart.
 */
export class PlatformConfigService {
  /** The live economics config (creates defaults on first call). */
  async get(): Promise<PlatformConfigDoc> {
    const cached = await kv().get(CONFIG_KEY);
    if (cached) return this.withDefaults(JSON.parse(cached));

    const doc =
      (await PlatformConfigModel.findById('platform').lean<PlatformConfigDoc>()) ??
      (await PlatformConfigModel.create({ _id: 'platform' })).toObject();

    const full = this.withDefaults(doc);
    await kv().set(CONFIG_KEY, JSON.stringify(full), TTL);
    return full;
  }

  /**
   * Backfill any section a stored (or cached) document predates.
   *
   * Mongoose only applies schema defaults on INSERT — a config saved before a
   * new section existed comes back without it, and `cfg.surge.enabled` explodes.
   * Adding a field to platform economics must never be able to 500 the API, so
   * reads are always merged over the defaults.
   */
  private withDefaults(doc: Partial<PlatformConfigDoc>): PlatformConfigDoc {
    return {
      ...doc,
      deposit: {
        enabled: true,
        minCents: 25000,
        maxCents: 100000,
        multiplierBps: 20000,
        autoReleaseHours: 24,
        ...(doc.deposit ?? {}),
      },
      commission: { defaultBps: 2000, minBps: 0, maxBps: 4000, ...(doc.commission ?? {}) },
      tax: { bps: 0, ...(doc.tax ?? {}) },
      pricing: { earlyBirdMinDaysAhead: 30, lastMinuteMaxHoursAhead: 48, ...(doc.pricing ?? {}) },
      cancellation: {
        flexible: { fullBeforeHours: 24, partialBps: 5000, ...(doc.cancellation?.flexible ?? {}) },
        moderate: { fullBeforeHours: 48, partialBps: 5000, ...(doc.cancellation?.moderate ?? {}) },
        strict: { fullBeforeHours: 168, partialBps: 0, ...(doc.cancellation?.strict ?? {}) },
      },
      noShow: { graceHours: 2, guestForfeitBps: 5000, ...(doc.noShow ?? {}) },
      rebookingProtection: {
        enabled: true,
        coverageBps: 10000,
        maxCoverageCents: 15000,
        windowHours: 72,
        ...(doc.rebookingProtection ?? {}),
        hostPenalty: {
          enabled: true,
          flatCents: 5000,
          pctOfBookingBps: 0,
          graceCancellations: 1,
          graceWindowDays: 365,
          ...(doc.rebookingProtection?.hostPenalty ?? {}),
        },
      },
      superhost: { minTrips: 5, minRatingAvg: 4.8, minRatingCount: 3, maxCancellationRatePct: 5, ...(doc.superhost ?? {}) },
      trust: {
        tiers: { gold: 80, silver: 55, bronze: 30, ...(doc.trust?.tiers ?? {}) },
        verificationPoints: { email: 5, phone: 10, licence: 15, ...(doc.trust?.verificationPoints ?? {}) },
        perks: {
          depositDiscountPctByTier: {
            new: 0, bronze: 0, silver: 50, gold: 100,
            ...(doc.trust?.perks?.depositDiscountPctByTier ?? {}),
          },
          instantBookMinTier: doc.trust?.perks?.instantBookMinTier ?? 'bronze',
          prioritySupportMinTier: doc.trust?.perks?.prioritySupportMinTier ?? 'silver',
        },
      },
      risk: { bands: { block: 90, high: 60, medium: 30, ...(doc.risk?.bands ?? {}) } },
      notifications: {
        categoryChannels: {
          trips: { push: true, email: true, sms: true },
          messages: { push: true, email: false, sms: false },
          payments: { push: true, email: true, sms: false },
          promotions: { push: true, email: true, sms: false },
          reviews: { push: true, email: true, sms: false },
          account: { push: true, email: true, sms: true },
          ...(doc.notifications?.categoryChannels ?? {}),
        },
      },
      wallet: {
        maxBalanceCentsByTier: { new: 50000, bronze: 200000, silver: 500000, gold: 1000000, ...(doc.wallet?.maxBalanceCentsByTier ?? {}) },
      },
      payoutTrust: { newHostTripThreshold: 3, newHostExtraHoldHours: 48, ...(doc.payoutTrust ?? {}) },
      incidentals: {
        fuelPerPercentCents: 300, cleaningCents: 7500, smokingCents: 25000, petCents: 10000, lateReturnPerHourCents: 2500,
        ...(doc.incidentals ?? {}),
      },
      payout: { holdHours: 24, instantFeeBps: 150, instantFeeMinCents: 50, ...(doc.payout ?? {}) },
      rewards: {
        pointValueCents: 5,
        pointsPerDollar: 1,
        minRedemptionPoints: 100,
        ...(doc.rewards ?? {}),
        // An empty array would silently leave the programme with no ladder, so
        // only a non-empty override replaces the default.
        tiers: doc.rewards?.tiers?.length ? doc.rewards.tiers : DEFAULT_REWARD_TIERS,
      },
      booking: {
        hostApprovalHours: 24,
        verificationGraceHours: 72,
        checkoutHoldMinutes: 15,
        priceLockMinutes: 10,
        ...(doc.booking ?? {}),
      },
      search: {
        ranking: {
          categoryMatch: 3,
          bodyTypeMatch: 2,
          priceProximity: 2,
          ratingWeight: 0.5,
          superhostBoost: 1,
          tripsWeight: 0.02,
          tripsCap: 20,
          ...(doc.search?.ranking ?? {}),
        },
      },
      referral: { referrerCreditCents: 2000, refereeCreditCents: 1000, referrerPoints: 200, refereePoints: 100, ...(doc.referral ?? {}) },
      protection: doc.protection?.length
        ? doc.protection
        : [
            { code: 'basic', label: 'Basic', description: 'Included. Higher deductible, essential coverage.', pricePerDay: 0 },
            { code: 'standard', label: 'Standard', description: 'Lower deductible, exterior damage protection.', pricePerDay: 1500 },
            { code: 'premier', label: 'Premier', description: 'Zero deductible, full protection & roadside.', pricePerDay: 3000 },
          ],
      support: {
        slaHours: { urgent: 4, high: 12, normal: 48, low: 72, ...(doc.support?.slaHours ?? {}) },
      },
      surge: {
        enabled: true,
        autoEnabled: true,
        maxMultiplierBps: 15000,
        ...(doc.surge ?? {}),
        occupancyThresholds: doc.surge?.occupancyThresholds?.length
          ? doc.surge.occupancyThresholds
          : [
              { occupancyPct: 70, multiplierBps: 11000 },
              { occupancyPct: 85, multiplierBps: 12500 },
              { occupancyPct: 95, multiplierBps: 14000 },
            ],
      },
    } as PlatformConfigDoc;
  }

  /** Patch the config. Guard-railed, audited, and hot — takes effect at once. */
  async update(patch: Record<string, unknown>, actorId: string): Promise<PlatformConfigDoc> {
    const current = await this.get();

    // Guard rails: a fat-fingered 90% take rate must not be possible.
    const c = patch.commission as PlatformConfigDoc['commission'] | undefined;
    if (c) {
      const min = c.minBps ?? current.commission.minBps;
      const max = c.maxBps ?? current.commission.maxBps;
      const def = c.defaultBps ?? current.commission.defaultBps;
      if (min > max) throw new ValidationError('commission.minBps cannot exceed maxBps');
      if (def < min || def > max) {
        throw new ValidationError(`commission.defaultBps must be between ${min} and ${max} bps`);
      }
    }

    // Shallow-merge each section over the current values, so a partial update
    // (e.g. just commission.defaultBps) never drops its sibling fields.
    const merged: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      const cur = (current as unknown as Record<string, unknown>)[k];
      merged[k] =
        v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object'
          ? { ...(cur as object), ...(v as object) }
          : v;
    }

    const doc = await PlatformConfigModel.findByIdAndUpdate(
      'platform',
      { $set: { ...merged, updatedBy: actorId } },
      { new: true, upsert: true },
    ).lean<PlatformConfigDoc>();

    await this.invalidate();
    emit(EVENTS.PLATFORM_CONFIG_UPDATED, 'platform', { actorId, keys: Object.keys(patch) });
    logger.info({ actorId, keys: Object.keys(patch) }, '⚙️  Platform config updated (hot)');
    return doc!;
  }

  // ── Commission rules ────────────────────────────────────────────────

  async listRules(): Promise<CommissionRuleDoc[]> {
    return CommissionRuleModel.find().sort({ active: -1, priority: -1, createdAt: -1 }).lean<CommissionRuleDoc[]>();
  }

  async createRule(
    input: {
      name: string;
      scope: CommissionScope;
      scopeValue?: string;
      commissionBps: number;
      priority?: number;
      effectiveFrom?: Date;
      effectiveTo?: Date;
    },
    actorId: string,
  ): Promise<CommissionRuleDoc> {
    const cfg = await this.get();
    if (input.commissionBps < cfg.commission.minBps || input.commissionBps > cfg.commission.maxBps) {
      throw new ValidationError(
        `Commission must be between ${cfg.commission.minBps} and ${cfg.commission.maxBps} bps`,
      );
    }
    if (input.scope !== 'global' && !input.scopeValue) {
      throw new ValidationError(`A ${input.scope} rule needs a scopeValue`);
    }

    const rule = await CommissionRuleModel.create({ ...input, createdBy: actorId });
    await this.invalidate();
    logger.info({ actorId, rule: rule._id, bps: input.commissionBps }, 'Commission rule created');
    return rule.toObject();
  }

  async updateRule(id: string, patch: Partial<CommissionRuleDoc>, actorId: string): Promise<CommissionRuleDoc> {
    if (patch.commissionBps != null) {
      const cfg = await this.get();
      if (patch.commissionBps < cfg.commission.minBps || patch.commissionBps > cfg.commission.maxBps) {
        throw new ValidationError(
          `Commission must be between ${cfg.commission.minBps} and ${cfg.commission.maxBps} bps`,
        );
      }
    }
    const rule = await CommissionRuleModel.findByIdAndUpdate(
      id,
      { $set: { ...patch, createdBy: patch.createdBy ?? actorId } },
      { new: true },
    ).lean<CommissionRuleDoc>();
    if (!rule) throw new ValidationError('Commission rule not found');
    await this.invalidate();
    return rule;
  }

  async deleteRule(id: string): Promise<void> {
    await CommissionRuleModel.deleteOne({ _id: id });
    await this.invalidate();
  }

  /**
   * Resolve the take rate for one booking. Most specific active rule wins:
   * host > hostTier > category > global default.
   */
  async resolveCommission(ctx: CommissionContext): Promise<ResolvedCommission> {
    const rules = await this.activeRules();
    const now = Date.now();

    const matches = rules.filter((r) => {
      if (r.effectiveFrom && now < +new Date(r.effectiveFrom)) return false;
      if (r.effectiveTo && now > +new Date(r.effectiveTo)) return false;
      switch (r.scope) {
        case 'global':
          return true;
        case 'category':
          return !!ctx.category && r.scopeValue === ctx.category;
        case 'hostTier':
          return !!ctx.hostTier && r.scopeValue === ctx.hostTier;
        case 'host':
          return !!ctx.hostId && r.scopeValue === ctx.hostId;
        default:
          return false;
      }
    });

    if (matches.length === 0) {
      const cfg = await this.get();
      return { bps: cfg.commission.defaultBps, source: 'default' };
    }

    matches.sort(
      (a, b) =>
        SCOPE_SPECIFICITY[b.scope] - SCOPE_SPECIFICITY[a.scope] ||
        b.priority - a.priority ||
        +new Date(b.createdAt) - +new Date(a.createdAt),
    );
    const win = matches[0];
    return {
      bps: win.commissionBps,
      source: win.scopeValue ? `${win.scope}:${win.scopeValue}` : win.scope,
      ruleId: win._id,
    };
  }

  private async activeRules(): Promise<CommissionRuleDoc[]> {
    const cached = await kv().get(RULES_KEY);
    if (cached) return JSON.parse(cached) as CommissionRuleDoc[];
    const rules = await CommissionRuleModel.find({ active: true }).lean<CommissionRuleDoc[]>();
    await kv().set(RULES_KEY, JSON.stringify(rules), TTL);
    return rules;
  }

  /** Drop the caches so the next read sees the change immediately. */
  private async invalidate(): Promise<void> {
    await Promise.all([kv().del(CONFIG_KEY), kv().del(RULES_KEY)]);
  }
}

export const platformConfigService = new PlatformConfigService();
