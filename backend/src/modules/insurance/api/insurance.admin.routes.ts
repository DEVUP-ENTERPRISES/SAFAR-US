import { Router } from 'express';
import { z } from 'zod';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { sendSuccess } from '../../../shared/http/api-response';
import { wheelbaseInsuranceService } from '../application/wheelbase-insurance.service';

const router = Router();

/** Every car with its Wheelbase link and insurance, and the dealer's listings to link to. */
router.get(
  '/insurance/wheelbase',
  authorize('admin:read'),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await wheelbaseInsuranceService.overview());
  }),
);

/** Read Wheelbase now instead of waiting for the next scheduled check. */
router.post(
  '/insurance/wheelbase/sync',
  authorize('vehicle:verify'),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await wheelbaseInsuranceService.sync());
  }),
);

/** Tie a car to a Wheelbase listing, or clear it with null. */
router.patch(
  '/insurance/wheelbase/vehicles/:id',
  authorize('vehicle:verify'),
  validate({ body: z.object({ rentalId: z.number().int().positive().nullable() }) }),
  asyncHandler(async (req, res) => {
    await wheelbaseInsuranceService.link(req.params.id, req.body.rentalId);
    sendSuccess(res, { ok: true });
  }),
);

export const insuranceAdminRoutes = router;
