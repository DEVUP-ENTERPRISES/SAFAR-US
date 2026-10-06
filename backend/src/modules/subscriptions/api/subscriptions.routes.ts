import { Router } from 'express';
import { z } from 'zod';
import { subscriptionService } from '../application/subscription.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { AppError } from '../../../core/errors/app-error';

const router = Router();

// CATO Plus can be paused from admin: nothing is offered and nobody new can join; existing members are unaffected.
const membershipOn = async () => (await platformConfigService.get()).programs.membershipEnabled;

/** Public: the membership tiers on offer. */
router.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, (await membershipOn()) ? await subscriptionService.listPlans(true) : []);
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

router.get(
  '/me/savings',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await subscriptionService.savingsFor(req.principal!.userId));
  }),
);

router.post(
  '/subscribe',
  authenticate,
  validate({ body: z.object({ planCode: z.string().min(1) }) }),
  asyncHandler(async (req, res) => {
    if (!(await membershipOn())) throw new AppError({ code: 'PROGRAM_PAUSED', message: 'Membership is paused for now.', httpStatus: 403 });
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
