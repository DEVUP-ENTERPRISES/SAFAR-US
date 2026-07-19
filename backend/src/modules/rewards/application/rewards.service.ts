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

/** Loyalty tiers by lifetime points. Higher tiers earn faster + get perks. */
export const TIERS: Tier[] = [
  { key: 'bronze', label: 'Bronze', min: 0, earnMultiplierBps: 10000, perks: ['Earn 1 point per $1'] },
  { key: 'silver', label: 'Silver', min: 500, earnMultiplierBps: 11000, perks: ['10% bonus points', 'Priority support'] },
  { key: 'gold', label: 'Gold', min: 2000, earnMultiplierBps: 12500, perks: ['25% bonus points', 'Free cancellation window', 'Priority support'] },
  { key: 'platinum', label: 'Platinum', min: 5000, earnMultiplierBps: 15000, perks: ['50% bonus points', 'Free delivery credits', 'Dedicated concierge'] },
];

// Point value now lives in PlatformConfig (admin-tunable).

export class RewardsService {
  tierFor(lifetime: number): Tier {
    return [...TIERS].reverse().find((t) => lifetime >= t.min) ?? TIERS[0];
  }
  nextTier(lifetime: number): Tier | null {
    return TIERS.find((t) => t.min > lifetime) ?? null;
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
    const tier = this.tierFor(lifetime);
    const points = Math.round((basePoints * tier.earnMultiplierBps) / 10000);
    await RewardEntryModel.create({ userId, points, type, refType, refId, description });
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
    const tier = this.tierFor(lifetime);
    const next = this.nextTier(lifetime);
    const cfg = await platformConfigService.get();
    return { balance, lifetime, tier, nextTier: next, toNext: next ? next.min - lifetime : 0, pointValueCents: cfg.rewards.pointValueCents, history };
  }

  /** Redeem points → wallet credit (double-entry: promo_expense → user_wallet). */
  async redeem(userId: string, points: number): Promise<{ redeemed: number; creditCents: number }> {
    if (points < 100) throw new ValidationError('Minimum redemption is 100 points');
    const balance = await this.balance(userId);
    if (points > balance) throw new ConflictError('Not enough points', 'INSUFFICIENT_POINTS');

    const cfg = await platformConfigService.get();
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
