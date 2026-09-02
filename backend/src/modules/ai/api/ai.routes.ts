import { Router } from 'express';
import { z } from 'zod';
import { aiGateway } from '../infrastructure/ai.gateway';
import { damageReviewService } from '../application/damage-review.service';
import { caseFileService } from '../application/case-file.service';
import { TripModel } from '../../trips/infrastructure/trip.model';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

/**
 * Whether AI features should render at all. The client hides the surface
 * rather than showing a button that errors — same contract the payment and
 * maps providers use.
 */
router.get(
  '/status',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, { enabled: aiGateway.isEnabled() });
  }),
);

/**
 * Damage review for a trip.
 *
 * Either party to the trip may READ the assessment — both sides seeing the
 * same verdict is the point. Running one is restricted to the host or staff,
 * because it costs money and a guest could otherwise loop it.
 */
router.get(
  '/trips/:tripId/damage-review',
  authenticate,
  asyncHandler(async (req, res) => {
    const trip = await TripModel.findById(req.params.tripId).lean();
    const uid = req.principal!.userId;
    const isParty = !!trip && (trip.guestId === uid || trip.hostId === uid);
    const isStaff = !!req.principal?.permissions?.includes('claim:manage');
    // Not a party and not staff reads the same as "no assessment": the
    // existence of a damage finding is itself information about the trip.
    sendSuccess(res, isParty || isStaff ? await damageReviewService.get(req.params.tripId) : null);
  }),
);

router.post(
  '/trips/:tripId/damage-review',
  authenticate,
  asyncHandler(async (req, res) => {
    const trip = await TripModel.findById(req.params.tripId).lean();
    if (!trip) throw new Error('Trip not found');
    const uid = req.principal!.userId;
    const isStaff = !!req.principal?.permissions?.includes('claim:manage');
    if (trip.hostId !== uid && !isStaff) {
      throw Object.assign(new Error('Only the host or staff can run a damage review'), { status: 403 });
    }
    sendSuccess(res, await damageReviewService.review(req.params.tripId, uid));
  }),
);

/** Case file for a claim — staff only; it summarises both parties' evidence. */
router.get(
  '/claims/:claimId/case-file',
  authenticate,
  authorize('claim:manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await caseFileService.build(req.params.claimId));
  }),
);

/** What AI has cost, by feature. */
router.get(
  '/usage',
  authenticate,
  authorize('platform:manage'),
  validate({ query: z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }).partial() }),
  asyncHandler(async (req, res) => {
    const days = Number(req.query.days ?? 7);
    const since = new Date(Date.now() - days * 864e5);
    const { AiUsageModel } = await import('../infrastructure/ai-usage.model');
    const byFeature = await AiUsageModel.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: '$feature',
          calls: { $sum: 1 },
          failures: { $sum: { $cond: ['$ok', 0, 1] } },
          costCents: { $sum: '$costCents' },
          avgLatencyMs: { $avg: '$latencyMs' },
        },
      },
      { $sort: { costCents: -1 } },
    ]);
    sendSuccess(res, {
      windowDays: days,
      spentTodayCents: await aiGateway.spentTodayCents(),
      byFeature,
    });
  }),
);

export const aiRoutes = router;
