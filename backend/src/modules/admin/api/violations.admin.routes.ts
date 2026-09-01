import { Router } from 'express';
import { z } from 'zod';
import { violationService } from '../../violations/application/violation.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

/**
 * Citation adjudication.
 *
 * Charging is gated on `payment:refund` — the same bar as issuing a refund,
 * because taking money out of a guest's account weeks after their trip deserves
 * the same scrutiny as putting it back. A host reports; only staff charge.
 */
const router = Router();

router.get(
  '/violations',
  authorize('claim:manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await violationService.adminList({
        status: req.query.status as string,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      }),
    );
  }),
);

router.post(
  '/violations/:id/charge',
  authorize('payment:refund'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await violationService.charge(req.principal!.userId, req.params.id));
  }),
);

router.post(
  '/violations/:id/waive',
  authorize('claim:manage'),
  validate({ body: z.object({ resolution: z.string().min(3).max(500) }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await violationService.waive(req.principal!.userId, req.params.id, req.body.resolution));
  }),
);

export const violationsAdminRoutes = router;
