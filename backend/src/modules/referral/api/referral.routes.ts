import { Router } from 'express';
import { referralService } from '../application/referral.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => sendSuccess(res, await referralService.myReferral(req.principal!.userId))),
);

export const referralRoutes = router;
