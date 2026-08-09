import { RewardEntryModel, type RewardEntryDoc } from '../infrastructure/reward.model';
import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { ConflictError, ValidationError } from '../../../core/errors/app-error';

export interface Tier {
  key: string;
  label: string;
  min: number;
  earnMultiplierBps: number; // 10000 = 1x, 12500 = 1.25x
  perks: string[];
}

/**
 * Perk copy per tier. The thresholds and earn rates live in PlatformConfig
 * (admin-tunable); this is the marketing text that goes with each rung.
 */
const TIER_PERKS: Record<string, string[]> = {
  bronze: ['Earn 1 point per $1'],
  silver: ['10% bonus points', 'Priority support'],
  gold: ['25% bonus points', 'Free cancellation window', 'Priority support'],
  platinum: ['50% bonus points', 'Free delivery credits', 'Dedicated concierge'],
};

// Point value now lives in PlatformConfig (admin-tunable).

export class RewardsService {
  /**
   * The ladder, from config. Thresholds and earn rates are admin-tunable (how
   * generous the programme is); the perk copy stays in code because it is
   * marketing text, not economics. Sorted defensively — an admin can add a tier
   * out of order and the comparisons must still hold.
   */
  private async tiers(): Promise<Tier[]> {
    const { rewards } = await platformConfigService.get();
    return [...rewards.tiers]
      .sort((a, b) => a.min - b.min)
      .map((t) => ({ ...t, perks: TIER_PERKS[t.key] ?? [] }));
  }

  async tierFor(lifetime: number): Promise<Tier> {
    const tiers = await this.tiers();
    return [...tiers].reverse().find((t) => lifetime >= t.min) ?? tiers[0];
  }
  async nextTier(lifetime: number): Promise<Tier | null> {
    return (await this.tiers()).find((t) => t.min > lifetime) ?? null;
  }

  async balance(userId: string): Promise<number> {
    const [row] = await RewardEntryModel.aggregate<{ total: number }>([
      { $match: { userId } },
      { $group: { _id: null, total: { $sum: '$points' } } },
    ]);
    return row?.total ?? 0;
  }
  async lifetime(userId: string): Promise<number> {
    const [row] = await RewardEntryModel.aggregate<{ total: number }>([
      { $match: { userId, points: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$points' } } },
    ]);
    return row?.total ?? 0;
  }

  async award(userId: string, basePoints: number, type: RewardEntryDoc['type'], refType: string, refId: string, description: string): Promise<void> {
    if (basePoints <= 0) return;
    // Idempotency: don't double-award for the same ref.
    if (refId) {
      const existing = await RewardEntryModel.findOne({ userId, refType, refId, type }).lean();
      if (existing) return;
    }
    const lifetime = await this.lifetime(userId);
    const tier = await this.tierFor(lifetime);
    const points = Math.round((basePoints * tier.earnMultiplierBps) / 10000);
    await RewardEntryModel.create({ userId, points, type, refType, refId, description });
  }

  /**
   * A staff points adjustment — service recovery, or reversing abuse.
   *
   * Deliberately not `award()`: that one refuses non-positive values, scales by
   * the member's tier multiplier, and dedupes by reference. A correction must
   * be exact, may be negative, and must be repeatable. Clamped so a deduction
   * cannot push a balance below zero.
   */
  async adminAdjust(userId: string, points: number, actorId: string, reason: string): Promise<void> {
    if (!Number.isInteger(points) || points === 0) {
      throw new ValidationError('Adjustment must be a non-zero whole number of points');
    }
    let delta = points;
    if (delta < 0) {
      const balance = await this.balance(userId);
      if (Math.abs(delta) > balance) delta = -balance;
      if (delta === 0) return;
    }
    await RewardEntryModel.create({
      userId,
      points: delta,
      type: 'adjustment',
      refType: 'admin',
      refId: actorId,
      description: `Staff adjustment by ${actorId}: ${reason}`,
    });
  }

  async summary(userId: string): Promise<{
    balance: number; lifetime: number; tier: Tier; nextTier: Tier | null; toNext: number;
    pointValueCents: number; history: RewardEntryDoc[];
  }> {
    const [balance, lifetime, history] = await Promise.all([
      this.balance(userId),
      this.lifetime(userId),
      RewardEntryModel.find({ userId }).sort({ createdAt: -1 }).limit(30).lean<RewardEntryDoc[]>(),
    ]);
    const tier = await this.tierFor(lifetime);
    const next = await this.nextTier(lifetime);
    const cfg = await platformConfigService.get();
    return { balance, lifetime, tier, nextTier: next, toNext: next ? next.min - lifetime : 0, pointValueCents: cfg.rewards.pointValueCents, history };
  }

  /** Redeem points → wallet credit (double-entry: promo_expense → user_wallet). */
  async redeem(userId: string, points: number): Promise<{ redeemed: number; creditCents: number }> {
    const cfg = await platformConfigService.get();
    const min = cfg.rewards.minRedemptionPoints;
    if (points < min) throw new ValidationError(`Minimum redemption is ${min} points`);
    const balance = await this.balance(userId);
    if (points > balance) throw new ConflictError('Not enough points', 'INSUFFICIENT_POINTS');

    const creditCents = points * cfg.rewards.pointValueCents;
    await ledgerService.post({
      refType: 'reward_redeem',
      refId: userId,
      currency: 'USD',
      description: `Redeemed ${points} CATO points`,
      legs: [
        { account: Account.promoExpense(), direction: 'debit', amount: creditCents },
        { account: Account.userWallet(userId), direction: 'credit', amount: creditCents },
      ],
    });
    await RewardEntryModel.create({ userId, points: -points, type: 'redeem', refType: 'wallet', refId: '', description: `Redeemed for $${(creditCents / 100).toFixed(2)} wallet credit` });
    return { redeemed: points, creditCents };
  }
}

export const rewardsService = new RewardsService();
