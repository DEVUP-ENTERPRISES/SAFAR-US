import { Router } from 'express';
import { z } from 'zod';
import { claimService } from '../application/claim.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';
import { bookingService } from '../../bookings/application/booking.service';

const router = Router();

const createSchema = z.object({
  type: z.enum(['damage', 'insurance', 'dispute']),
  bookingId: z.string().optional(),
  tripId: z.string().optional(),
  hostId: z.string().optional(),
  description: z.string().min(5).max(2000),
  amountClaimed: z.number().int().min(0).optional(),
  evidence: z
    .array(z.object({ url: z.string().url(), kind: z.enum(['image', 'file']), note: z.string().optional() }))
    .default([]),
});

router.post(
  '/',
  authenticate,
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await claimService.create(req.principal!.userId, req.body));
  }),
);

router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await claimService.listForUser(req.principal!.userId));
  }),
);

/**
 * "Is this trip finished with me?" — when the damage window closes, and whether
 * anything is still outstanding. Placed above /:id so the literal path wins.
 */
router.get(
  '/settlement/:bookingId',
  authenticate,
  asyncHandler(async (req, res) => {
    // Leaked whether a booking existed and when its claim window closed to any
    // signed-in user. Low value to an attacker, but it is other people's data.
    await bookingService.get(req.principal!, req.params.bookingId);
    sendSuccess(res, await claimService.settlementStatus(req.params.bookingId));
  }),
);

router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await claimService.getForUser(req.principal!.userId, req.params.id));
  }),
);

export const claimsRoutes = router;
