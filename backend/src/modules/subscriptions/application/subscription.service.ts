import {
  SubscriptionPlanModel,
  UserSubscriptionModel,
  type SubscriptionPlanDoc,
  type UserSubscriptionDoc,
} from '../infrastructure/subscription.model';
import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';
import { paymentGateway } from '../../payments/infrastructure/gateway.provider';
import { NotFoundError, ConflictError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';

/** The zero-benefit default for a user with no membership. */
const NO_BENEFITS: SubscriptionPlanDoc['benefits'] = {
  bookingDiscountBps: 0,
  waiveSurge: false,
  rewardsMultiplierBps: 10000,
};

export class SubscriptionService {
  // ── Plans (admin-managed) ───────────────────────────────────────────

  async listPlans(activeOnly = false): Promise<SubscriptionPlanDoc[]> {
    return SubscriptionPlanModel.find(activeOnly ? { active: true } : {})
      .sort({ priceCents: 1 })
      .lean<SubscriptionPlanDoc[]>();
  }

  async upsertPlan(code: string, patch: Partial<SubscriptionPlanDoc>): Promise<SubscriptionPlanDoc> {
    const plan = await SubscriptionPlanModel.findOneAndUpdate(
      { code },
      { $set: { ...patch, code } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean<SubscriptionPlanDoc>();
    return plan!;
  }

  async deletePlan(code: string): Promise<void> {
    await SubscriptionPlanModel.deleteOne({ code });
  }

  // ── Membership ──────────────────────────────────────────────────────

  /** The user's live benefits — the pricing engine's only entry point. */
  async benefitsFor(userId: string): Promise<SubscriptionPlanDoc['benefits']> {
    const sub = await this.activeFor(userId);
    return sub?.benefitsSnapshot ?? NO_BENEFITS;
  }

  async activeFor(userId: string): Promise<UserSubscriptionDoc | null> {
    const sub = await UserSubscriptionModel.findOne({ userId, status: 'active' }).lean<UserSubscriptionDoc>();
    if (!sub) return null;
    // Lazily expire — no cron needed for correctness.
    if (+new Date(sub.renewsAt) < Date.now()) {
      await UserSubscriptionModel.updateOne({ _id: sub._id }, { status: 'expired' });
      return null;
    }
    return sub;
  }

  /** Buy a membership. Charges the card and books it through the ledger. */
  async subscribe(userId: string, planCode: string): Promise<UserSubscriptionDoc> {
    const existing = await this.activeFor(userId);
    if (existing) throw new ConflictError('You already have an active membership', 'ALREADY_SUBSCRIBED');

    const plan = await SubscriptionPlanModel.findOne({ code: planCode, active: true }).lean<SubscriptionPlanDoc>();
    if (!plan) throw new NotFoundError('Subscription plan');

    if (plan.priceCents > 0) {
      const intent = await paymentGateway.createIntent({
        amount: { amount: plan.priceCents, currency: 'USD' },
        userId,
        capture: true,
        idempotencyKey: `sub_${userId}_${planCode}_${Date.now()}`,
      });
      await ledgerService.post({
        refType: 'subscription',
        refId: intent.intentId,
        currency: 'USD',
        description: `CATO ${plan.name} membership`,
        legs: [
          { account: Account.gatewayClearing(), direction: 'credit', amount: plan.priceCents },
          { account: Account.platformRevenue(), direction: 'debit', amount: plan.priceCents },
        ],
      });
    }

    const renewsAt = new Date();
    renewsAt.setMonth(renewsAt.getMonth() + 1);

    const sub = await UserSubscriptionModel.create({
      userId,
      planCode: plan.code,
      status: 'active',
      // Snapshot: if admin later changes the plan, this member keeps what they bought.
      benefitsSnapshot: plan.benefits,
      pricePaidCents: plan.priceCents,
      renewsAt,
    });
    logger.info({ userId, planCode }, '⭐ membership started');
    return sub.toObject();
  }

  async cancel(userId: string): Promise<void> {
    const sub = await this.activeFor(userId);
    if (!sub) throw new NotFoundError('Active membership');
    // Stays active until the paid period ends — they already paid for it.
    await UserSubscriptionModel.updateOne(
      { _id: sub._id },
      { status: 'cancelled', cancelledAt: new Date() },
    );
    logger.info({ userId }, 'membership cancelled (runs to period end)');
  }

  /** Admin: who is subscribed, and what is it worth. */
  async stats(): Promise<{ planCode: string; members: number; mrrCents: number }[]> {
    return UserSubscriptionModel.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$planCode', members: { $sum: 1 }, mrrCents: { $sum: '$pricePaidCents' } } },
      { $project: { _id: 0, planCode: '$_id', members: 1, mrrCents: 1 } },
      { $sort: { mrrCents: -1 } },
    ]).exec();
  }
}

export const subscriptionService = new SubscriptionService();
