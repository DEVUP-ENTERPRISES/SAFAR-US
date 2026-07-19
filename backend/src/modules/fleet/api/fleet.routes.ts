import { Router } from 'express';
import { z } from 'zod';
import { fleetService } from '../application/fleet.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';

const router = Router();

router.post(
  '/',
  authenticate,
  validate({ body: z.object({ name: z.string().min(2), region: z.string().optional(), group: z.string().optional() }) }),
  asyncHandler(async (req, res) => {
    const fleet = await fleetService.create(req.principal!.userId, req.body.name, req.body.region, req.body.group);
    sendCreated(res, fleet);
  }),
);

router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await fleetService.listForHost(req.principal!.userId));
  }),
);

router.post(
  '/:id/vehicles',
  authenticate,
  validate({ body: z.object({ vehicleId: z.string() }) }),
  asyncHandler(async (req, res) => {
    await fleetService.assignVehicle(req.principal!.userId, req.params.id, req.body.vehicleId);
    sendSuccess(res, { assigned: true });
  }),
);

router.get(
  '/:id/dashboard',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await fleetService.dashboard(req.principal!.userId, req.params.id));
  }),
);

router.get(
  '/:id/profitability',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await fleetService.profitability(req.principal!.userId, req.params.id));
  }),
);

export const fleetRoutes = router;
