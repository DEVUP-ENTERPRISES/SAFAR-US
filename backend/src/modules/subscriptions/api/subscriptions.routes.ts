import { Router } from 'express';
import { z } from 'zod';
import { subscriptionService } from '../application/subscription.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

/** Public: the membership tiers on offer. */
router.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await subscriptionService.listPlans(true));
  }),
);

/** The caller's live membership (null if none). */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await subscriptionService.activeFor(req.principal!.userId));
  }),
);

router.post(
  '/subscribe',
  authenticate,
  validate({ body: z.object({ planCode: z.string().min(1) }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await subscriptionService.subscribe(req.principal!.userId, req.body.planCode), 201);
  }),
);

router.post(
  '/cancel',
  authenticate,
  asyncHandler(async (req, res) => {
    await subscriptionService.cancel(req.principal!.userId);
    sendSuccess(res, { cancelled: true });
  }),
);

export const subscriptionsRoutes = router;
