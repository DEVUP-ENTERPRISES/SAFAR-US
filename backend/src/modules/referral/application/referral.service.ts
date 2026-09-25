import { ReferralCodeModel, ConversionModel } from '../infrastructure/referral.model';
import { rewardsService } from '../../rewards/application/rewards.service';
import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { userRepository } from '../../users/infrastructure/user.repository';
import { BookingModel, type BookingDoc } from '../../bookings/infrastructure/booking.model';
import { PaymentMethodModel } from '../../payments/infrastructure/payment-method.model';
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

  /**
   * Called when a booking completes: rewards both parties once the referred
   * guest's first trip is genuine. Referral credit is platform money that can be
   * spent on a booking and paid out to a host as cash, so it is withheld from the
   * obvious ways to farm it: a trip too small to matter, a car owned by the
   * referrer, the same card on both accounts, and a cap per referrer.
   */
  async convert(refereeId: string, bookingId: string): Promise<void> {
    const conv = await ConversionModel.findOne({ refereeId, status: 'pending' }).lean();
    if (!conv) return;
    const cfg = await platformConfigService.get();

    const booking = await BookingModel.findOne({ _id: bookingId, guestId: refereeId }).lean<BookingDoc>();
    if (!booking || booking.priceBreakdown.total.amount < cfg.referral.minTripSpendCents) return; // stays pending until a real trip

    const reject = async (reason: string) => {
      await ConversionModel.updateOne({ _id: conv._id, status: 'pending' }, { status: 'rejected', rejectedReason: reason });
      logger.warn({ conversion: conv._id, reason }, 'referral not rewarded');
    };

    if ((await ConversionModel.countDocuments({ referrerId: conv.referrerId, status: 'converted' })) >= cfg.referral.maxRewardsPerReferrer) {
      return reject('referrer_limit');
    }
    const { hostService } = await import('../../hosts/application/host.service');
    const host = await hostService.getById(booking.hostId).catch(() => null);
    if (host?.userId === conv.referrerId) return reject('booked_referrers_car');
    if (await this.shareCard(conv.referrerId, refereeId)) return reject('same_card');

    // Claim it atomically so two completions at once cannot both be paid.
    const claimed = await ConversionModel.findOneAndUpdate(
      { _id: conv._id, status: 'pending' },
      { status: 'converted', convertedAt: new Date() },
    );
    if (!claimed) return;

    await this.credit(conv.referrerId, cfg.referral.referrerCreditCents, `Referral reward (friend joined)`, `referral_${conv._id}_referrer`);
    await this.credit(conv.refereeId, cfg.referral.refereeCreditCents, `Welcome referral bonus`, `referral_${conv._id}_referee`);
    await rewardsService.award(conv.referrerId, cfg.referral.referrerPoints, 'referral', 'referral', conv._id, 'Referral bonus points');
    await rewardsService.award(conv.refereeId, cfg.referral.refereePoints, 'referral', 'referral', conv._id, 'Welcome bonus points');
    logger.info({ conversion: conv._id }, '🎉 referral converted — both rewarded');
  }

  /** The same physical card on both accounts is one person rewarding themselves. */
  private async shareCard(a: string, b: string): Promise<boolean> {
    const cards = await PaymentMethodModel.find({ userId: { $in: [a, b] } }).lean();
    const key = (c: { brand: string; last4: string; expMonth: number; expYear: number }) => `${c.brand}:${c.last4}:${c.expMonth}:${c.expYear}`;
    const mine = new Set(cards.filter((c) => c.userId === a).map(key));
    return cards.filter((c) => c.userId === b).some((c) => mine.has(key(c)));
  }

  private async credit(userId: string, cents: number, description: string, txnId: string): Promise<void> {
    await ledgerService.post({
      txnId,
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
    const base = (user?.firstName ?? 'CatoDrive').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 5) || 'CatoDrive';
    for (let i = 0; i < 5; i++) {
      const code = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
      if (!(await ReferralCodeModel.findOne({ code }).lean())) return code;
    }
    return `CATODRIVE${Date.now().toString(36).toUpperCase()}`;
  }
}

export const referralService = new ReferralService();
