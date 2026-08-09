import { Router } from 'express';
import { z } from 'zod';
import { walletService } from '../../wallet/application/wallet.service';
import { rewardsService } from '../../rewards/application/rewards.service';
import { RewardEntryModel } from '../../rewards/infrastructure/reward.model';
import { ConversionModel } from '../../referral/infrastructure/referral.model';
import { NotificationModel } from '../../notifications/infrastructure/notification.model';
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

// ── Notification delivery ─────────────────────────────────────────────

/**
 * Did the message actually arrive?
 *
 * Every send already records a per-channel attempt log, but nothing exposed it,
 * so "I never got the code" was unanswerable. Support can now read one member's
 * recent notifications with their delivery attempts and provider errors.
 */
router.get(
  '/notifications/:userId',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    const items = await NotificationModel.find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('templateKey channel title status attempts createdAt')
      .lean();
    sendSuccess(res, items);
  }),
);

/**
 * Delivery health across the platform: volume and failure rate per channel over
 * a window. A provider that starts silently failing (an expired Twilio key, an
 * SES suppression) shows up here before the support queue fills up.
 */
router.get(
  '/notifications/health/summary',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    const days = req.query.days ? Number(req.query.days) : 7;
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await NotificationModel.aggregate<{ _id: { channel: string; status: string }; count: number }>([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { channel: '$channel', status: '$status' }, count: { $sum: 1 } } },
    ]);

    const byChannel: Record<string, { sent: number; failed: number; queued: number; total: number; failureRatePct: number }> = {};
    for (const r of rows) {
      const c = (byChannel[r._id.channel] ??= { sent: 0, failed: 0, queued: 0, total: 0, failureRatePct: 0 });
      if (r._id.status === 'failed') c.failed += r.count;
      else if (r._id.status === 'queued') c.queued += r.count;
      else c.sent += r.count; // 'sent' and 'read' both mean it got there
      c.total += r.count;
    }
    for (const c of Object.values(byChannel)) {
      c.failureRatePct = c.total ? Math.round((c.failed / c.total) * 100) : 0;
    }
    sendSuccess(res, { windowDays: days, byChannel });
  }),
);

export const memberEconomyAdminRoutes = router;
