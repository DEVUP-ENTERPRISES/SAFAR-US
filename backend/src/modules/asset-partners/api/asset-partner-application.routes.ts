import { Router } from 'express';
import { assetPartnerApplicationService } from '../application/asset-partner-application.service';
import { createApplicationSchema } from '../dto/asset-partner-application.schemas';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate, authenticateOptional } from '../../../shared/middleware/authenticate';
import { authLimiter } from '../../../shared/middleware/auth-rate-limit';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';

const router = Router();

/**
 * The Asset Partner intake form submission. No login required — the form
 * never asks for a password — but authenticateOptional attaches a principal
 * when the applicant happens to be signed in, so the lead can be linked back
 * to their account. Rate-limited (shares the auth limiter) since it's an
 * unauthenticated write surface.
 */
router.post(
  '/asset-partner-applications',
  authLimiter,
  authenticateOptional,
  validate({ body: createApplicationSchema }),
  asyncHandler(async (req, res) => {
    const app = await assetPartnerApplicationService.create(req.body, {
      userId: req.principal?.userId,
      ip: req.ip,
      userAgent: req.header('user-agent'),
    });
    sendCreated(res, { reference: app.reference, status: app.status });
  }),
);

/**
 * The partner's own dashboard: their applications and, once they hold a host
 * account, what their cars are earning.
 *
 * Before this, an applicant got a reference number on submit and then had no
 * way to ever see the application again — the only view of it was the admin
 * queue. Signed in, because it returns their own personal and earnings data.
 */
router.get(
  '/asset-partners/dashboard',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await assetPartnerApplicationService.dashboardFor(req.principal!.userId));
  }),
);

export const assetPartnerApplicationRoutes = router;
