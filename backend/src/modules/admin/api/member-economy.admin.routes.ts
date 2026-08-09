import { Router } from 'express';
import { z } from 'zod';
import { walletService } from '../../wallet/application/wallet.service';
import { rewardsService } from '../../rewards/application/rewards.service';
import { RewardEntryModel } from '../../rewards/infrastructure/reward.model';
import { ConversionModel } from '../../referral/infrastructure/referral.model';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

/**
 * The member economy — wallets, loyalty points and referrals — which had no
 * admin surface at all. Support could see a member's balance nowhere and fix
 * nothing; the only remedy for a bad charge was a database edit.
 *
 * Reads are `admin:read` so support can answer "where did my money go?".
 * Anything that MOVES value is `payment:refund` — the same bar as issuing a
 * refund, because a goodwill credit is exactly that: money.
 */
const router = Router();

// ── Wallet ────────────────────────────────────────────────────────────

/** Balance + recent ledger movements for one member. */
router.get(
  '/wallets/:userId',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await walletService.adminView(req.params.userId));
  }),
);

/**
 * Goodwill credit or correction. Signed: positive credits the member, negative
 * claws back. A reason is mandatory — it lands in the ledger description and is
 * what makes the entry explicable months later.
 */
router.post(
  '/wallets/:userId/adjust',
  authorize('payment:refund'),
  validate({
    body: z.object({
      amount: z.number().int().refine((v) => v !== 0, 'Amount cannot be zero'),
      reason: z.string().min(3).max(200),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await walletService.adminAdjust(req.params.userId, req.body.amount, {
      actorId: req.principal!.userId,
      reason: req.body.reason,
    });
    sendSuccess(res, result);
  }),
);

// ── Loyalty points ────────────────────────────────────────────────────

router.get(
  '/rewards/:userId',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    const [summary, entries] = await Promise.all([
      rewardsService.summary(req.params.userId),
      RewardEntryModel.find({ userId: req.params.userId }).sort({ createdAt: -1 }).limit(50).lean(),
    ]);
    sendSuccess(res, { ...summary, entries });
  }),
);

/** Manually award (or deduct) points — service recovery, or reversing abuse. */
router.post(
  '/rewards/:userId/award',
  authorize('payment:refund'),
  validate({
    body: z.object({
      points: z.number().int().refine((v) => v !== 0, 'Points cannot be zero'),
      reason: z.string().min(3).max(200),
    }),
  }),
  asyncHandler(async (req, res) => {
    await rewardsService.adminAdjust(
      req.params.userId,
      req.body.points,
      req.principal!.userId,
      req.body.reason,
    );
    sendSuccess(res, await rewardsService.summary(req.params.userId));
  }),
);

// ── Referrals ─────────────────────────────────────────────────────────

/**
 * Referral programme health. Fraud in referral schemes is self-dealing at
 * scale, so the top referrers are surfaced alongside the totals — an outlier
 * here is the signal worth investigating.
 */
router.get(
  '/referrals/stats',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    const days = req.query.days ? Number(req.query.days) : 30;
    const since = new Date(Date.now() - days * 86_400_000);

    const [total, converted, recentTotal, topReferrers] = await Promise.all([
      ConversionModel.countDocuments({}),
      ConversionModel.countDocuments({ status: 'converted' }),
      ConversionModel.countDocuments({ createdAt: { $gte: since } }),
      ConversionModel.aggregate<{ _id: string; conversions: number }>([
        { $match: { status: 'converted' } },
        { $group: { _id: '$referrerId', conversions: { $sum: 1 } } },
        { $sort: { conversions: -1 } },
        { $limit: 10 },
      ]),
    ]);

    sendSuccess(res, {
      windowDays: days,
      total,
      converted,
      pending: total - converted,
      conversionRatePct: total ? Math.round((converted / total) * 100) : 0,
      inWindow: recentTotal,
      topReferrers: topReferrers.map((r) => ({ userId: r._id, conversions: r.conversions })),
    });
  }),
);

export const memberEconomyAdminRoutes = router;
