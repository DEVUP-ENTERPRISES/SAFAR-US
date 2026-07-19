import { Router } from 'express';
import { featureFlagService } from '../application/feature-flag.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

/** Client fetches its evaluated flags on launch/refresh. */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const flags = await featureFlagService.evaluateForUser(req.principal!.userId, req.principal!.roles);
    sendSuccess(res, flags);
  }),
);

export const featureFlagsRoutes = router;
