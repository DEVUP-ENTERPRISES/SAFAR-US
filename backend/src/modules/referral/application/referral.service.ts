import { ReferralCodeModel, ConversionModel } from '../infrastructure/referral.model';
import { rewardsService } from '../../rewards/application/rewards.service';
import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { userRepository } from '../../users/infrastructure/user.repository';
import { logger } from '../../../infrastructure/logging/logger';

// Referral credits AND bonus points live in PlatformConfig (admin-tunable, no deploy).

export class ReferralService {
  /** Get (or lazily create) the user's referral code + stats. */
  async myReferral(userId: string): Promise<{
    code: string; referred: number; pending: number;
    rewardPerReferral: { youGetCents: number; friendGetsCents: number };
  }> {
    let doc = await ReferralCodeModel.findOne({ userId }).lean();
    if (!doc) {
      const code = await this.generateCode(userId);
      doc = (await ReferralCodeModel.create({ userId, code })).toObject();
    }
    const [referred, pending] = await Promise.all([
      ConversionModel.countDocuments({ referrerId: userId, status: 'converted' }),
      ConversionModel.countDocuments({ referrerId: userId, status: 'pending' }),
    ]);
    const cfg = await platformConfigService.get();
    return {
      code: doc.code,
      referred,
      pending,
      rewardPerReferral: {
        youGetCents: cfg.referral.referrerCreditCents,
        friendGetsCents: cfg.referral.refereeCreditCents,
      },
    };
  }

  /** Called at signup when a referral code is provided. */
  async attach(refereeId: string, code: string): Promise<void> {
    const ref = await ReferralCodeModel.findOne({ code: code.toUpperCase() }).lean();
    if (!ref || ref.userId === refereeId) return; // invalid or self-referral
    const already = await ConversionModel.findOne({ refereeId }).lean();
    if (already) return;
    await ConversionModel.create({ code: ref.code, referrerId: ref.userId, refereeId, status: 'pending' });
    logger.info({ refereeId, referrerId: ref.userId }, 'referral attached');
  }

  /** Called on the referee's first completed booking → reward both parties. */
  async convert(refereeId: string): Promise<void> {
    const conv = await ConversionModel.findOne({ refereeId, status: 'pending' });
    if (!conv) return;
    conv.status = 'converted';
    conv.convertedAt = new Date();
    await conv.save();

    const cfg = await platformConfigService.get();
    await this.credit(conv.referrerId, cfg.referral.referrerCreditCents, `Referral reward (friend joined)`);
    await this.credit(conv.refereeId, cfg.referral.refereeCreditCents, `Welcome referral bonus`);
    await rewardsService.award(conv.referrerId, cfg.referral.referrerPoints, 'referral', 'referral', conv._id, 'Referral bonus points');
    await rewardsService.award(conv.refereeId, cfg.referral.refereePoints, 'referral', 'referral', conv._id, 'Welcome bonus points');
    logger.info({ conversion: conv._id }, '🎉 referral converted — both rewarded');
  }

  private async credit(userId: string, cents: number, description: string): Promise<void> {
    await ledgerService.post({
      refType: 'referral',
      refId: userId,
      currency: 'USD',
      description,
      legs: [
        { account: Account.promoExpense(), direction: 'debit', amount: cents },
        { account: Account.userWallet(userId), direction: 'credit', amount: cents },
      ],
    });
  }

  private async generateCode(userId: string): Promise<string> {
    const user = await userRepository.findById(userId);
    const base = (user?.firstName ?? 'CATO').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 5) || 'CATO';
    for (let i = 0; i < 5; i++) {
      const code = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
      if (!(await ReferralCodeModel.findOne({ code }).lean())) return code;
    }
    return `CATO${Date.now().toString(36).toUpperCase()}`;
  }
}

export const referralService = new ReferralService();
