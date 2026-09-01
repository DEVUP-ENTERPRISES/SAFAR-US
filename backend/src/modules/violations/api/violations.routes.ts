import { Router } from 'express';
import { z } from 'zod';
import { violationService } from '../application/violation.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';

const router = Router();

/**
 * A host reports a citation that arrived for a trip.
 *
 * Reporting is not charging: it opens a record the guest is told about and can
 * answer. Only staff can actually move the money.
 */
router.post(
  '/',
  authenticate,
  validate({
    body: z.object({
      bookingId: z.string().min(1),
      type: z.enum(['toll', 'parking', 'traffic', 'impound', 'other']),
      citationRef: z.string().min(2).max(80),
      issuedBy: z.string().min(2).max(120),
      occurredAt: z.coerce.date(),
      amount: z.number().int().positive(),
      evidence: z
        .array(z.object({ url: z.string().url(), kind: z.enum(['image', 'file']), note: z.string().max(200).optional() }))
        .default([]),
    }),
  }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await violationService.report(req.principal!.userId, req.body));
  }),
);

/** Citations raised against me. */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await violationService.listForUser(req.principal!.userId));
  }),
);

router.get(
  '/booking/:bookingId',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await violationService.listForBooking(req.params.bookingId));
  }),
);

/** The guest's answer. Holds the charge until staff rule on it. */
router.post(
  '/:id/dispute',
  authenticate,
  validate({ body: z.object({ reason: z.string().min(10).max(1000) }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await violationService.dispute(req.principal!.userId, req.params.id, req.body.reason));
  }),
);

export const violationsRoutes = router;
