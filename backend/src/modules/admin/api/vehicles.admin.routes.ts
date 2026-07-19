import { Router } from 'express';
import { z } from 'zod';
import { vehicleService } from '../../vehicles/application/vehicle.service';
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

router.post(
  '/vehicles/:id/action',
  authorize('vehicle:verify'),
  validate({ body: z.object({ action: z.enum(['approve', 'suspend', 'reject']) }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await vehicleService.adminSetStatus(req.params.id, req.body.action));
  }),
);

export const vehiclesAdminRoutes = router;
