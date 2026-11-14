import { Router } from 'express';
import { z } from 'zod';
import { bookingDriverService } from '../application/booking-driver.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate, authenticateOptional } from '../../../shared/middleware/authenticate';
import { lookupLimiter } from '../../../shared/middleware/auth-rate-limit';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();
const token = validate({ params: z.object({ token: z.string().min(20).max(64).regex(/^[A-Za-z0-9_-]+$/) }) });

/** What an invited driver sees before signing in: whose trip, which car, which dates. */
router.get('/:token', lookupLimiter, authenticateOptional, token, asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  sendSuccess(res, await bookingDriverService.preview(req.params.token, req.principal?.userId));
}));

router.post('/:token/accept', authenticate, lookupLimiter, token, asyncHandler(async (req, res) => {
  sendSuccess(res, await bookingDriverService.accept(req.principal!.userId, req.params.token));
}));

router.post('/:token/check', authenticate, lookupLimiter, token, asyncHandler(async (req, res) => {
  sendSuccess(res, await bookingDriverService.check(req.principal!.userId, req.params.token));
}));

export { router as driverInviteRoutes };
