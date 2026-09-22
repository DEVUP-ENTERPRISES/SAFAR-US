import { Router } from 'express';
import { authorize } from '../../../shared/middleware/authorize';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { sendSuccess } from '../../../shared/http/api-response';
import { config } from '../../../config';
import { authService } from '../../auth/application/auth.service';
import { userRepository } from '../../users/infrastructure/user.repository';

const router = Router();

/**
 * Mints a real Host session for the seeded House Fleet account — the door
 * an already-authenticated admin uses to launch the reused Host dashboard
 * for CatoDrive's own 110-vehicle fleet. platform:manage, not admin:read:
 * this hands out a live login, not a read.
 */
router.post(
  '/house-fleet/session',
  authorize('platform:manage'),
  asyncHandler(async (req, res) => {
    if (!config.houseFleet.enabled) {
      res.status(503).json({ success: false, error: { code: 'NOT_CONFIGURED', message: 'House Fleet is not seeded' } });
      return;
    }
    const user = await userRepository.findByEmail(config.houseFleet.email!.toLowerCase());
    if (!user) {
      res.status(503).json({ success: false, error: { code: 'NOT_SEEDED', message: 'House Fleet account not found' } });
      return;
    }
    const result = await authService.issueSessionForUser(user._id, { ip: req.ip, userAgent: req.get('user-agent') });
    sendSuccess(res, result);
  }),
);

export const houseFleetAdminRoutes = router;
