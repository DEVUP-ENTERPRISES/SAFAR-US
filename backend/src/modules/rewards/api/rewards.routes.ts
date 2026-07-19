import { Router } from 'express';
import { z } from 'zod';
import { rewardsService } from '../application/rewards.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => sendSuccess(res, await rewardsService.summary(req.principal!.userId))),
);

router.post(
  '/redeem',
  authenticate,
  validate({ body: z.object({ points: z.number().int().min(100) }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await rewardsService.redeem(req.principal!.userId, req.body.points))),
);

export const rewardsRoutes = router;
