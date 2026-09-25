import { Router } from 'express';
import { z } from 'zod';
import { vehicleService } from '../../vehicles/application/vehicle.service';
import { vehicleReviewService } from '../../vehicles/application/vehicle-review.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

router.get(
  '/vehicles',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    const result = await vehicleService.adminList({
      q: req.query.q as string,
      status: req.query.status as string,
      verification: req.query.verification as string,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      skip: req.query.skip ? Number(req.query.skip) : undefined,
    });
    sendSuccess(res, result.items, 200, { total: result.total });
  }),
);

/** Everything submitted for one vehicle, so approving isn't done blind. */
router.get(
  '/vehicles/:id/review',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await vehicleReviewService.detail(req.params.id));
  }),
);

router.post(
  '/vehicles/:id/action',
  authorize('vehicle:verify'),
  validate({ body: z.object({ action: z.enum(['approve', 'suspend', 'reject']) }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await vehicleService.adminSetStatus(req.params.id, req.body.action));
  }),
);

router.put(
  '/vehicles/:id/external-rating',
  authorize('vehicle:verify'),
  validate({
    body: z.union([
      z.object({ clear: z.literal(true) }),
      z.object({
        rating: z.number().min(1).max(5),
        trips: z.number().int().min(0).max(100_000),
        source: z.string().trim().min(2).max(30).default('Turo'),
      }),
    ]),
  }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await vehicleService.adminSetExternalRating(req.params.id, 'clear' in req.body ? null : req.body));
  }),
);

export const vehiclesAdminRoutes = router;
