import { Router } from 'express';
import { referralService } from '../application/referral.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { sendSuccess } from '../../../shared/http/api-response';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { AppError } from '../../../core/errors/app-error';

const router = Router();

// Paused from admin while the programme is reviewed.
router.use(asyncHandler(async (_req, _res, next) => {
    if (!(await platformConfigService.get()).programs.referralEnabled) throw new AppError({ code: 'PROGRAM_PAUSED', message: 'Refer a friend is paused for now.', httpStatus: 403 });
    next();
  }));

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => sendSuccess(res, await referralService.myReferral(req.principal!.userId))),
);

export const referralRoutes = router;
