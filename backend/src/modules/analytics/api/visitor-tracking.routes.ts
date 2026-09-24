import { Router } from 'express';
import { visitorTrackingService } from '../application/visitor-tracking.service';
import { trackVisitSchema } from '../dto/visitor-event.schemas';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticateOptional } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

/**
 * Public pageview beacon. No login required — the whole site calls this on
 * every navigation. Never throws a real error back to the page: a tracking
 * failure must not be visible to a visitor or block anything they're doing.
 */
router.post(
  '/analytics/track',
  authenticateOptional,
  validate({ body: trackVisitSchema }),
  asyncHandler(async (req, res) => {
    await visitorTrackingService
      .track(req.body, {
        ip: req.ip ?? '0.0.0.0',
        userAgent: req.header('user-agent') ?? '',
        userId: req.principal?.userId,
      })
      .catch(() => undefined);
    sendSuccess(res, { ok: true });
  }),
);

export const visitorTrackingRoutes = router;
