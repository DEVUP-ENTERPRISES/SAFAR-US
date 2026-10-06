import { Router } from 'express';
import { z } from 'zod';
import { rewardsService } from '../application/rewards.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { AppError } from '../../../core/errors/app-error';

const router = Router();

// Paused from admin while the programme is reviewed.
router.use(asyncHandler(async (_req, _res, next) => {
    if (!(await platformConfigService.get()).programs.rewardsEnabled) throw new AppError({ code: 'PROGRAM_PAUSED', message: 'Rewards are paused for now. Your points are safe.', httpStatus: 403 });
    next();
  }));

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
