import { Router } from 'express';
import { z } from 'zod';
import { claimService } from '../application/claim.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';

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

router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await claimService.getForUser(req.principal!.userId, req.params.id));
  }),
);

export const claimsRoutes = router;
