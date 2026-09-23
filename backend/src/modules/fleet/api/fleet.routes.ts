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

const policySchema = z.object({
  delivery: z
    .object({
      airport: z.boolean(),
      home: z.boolean(),
      hotel: z.boolean(),
      business: z.boolean(),
      fee: z.number().int().min(0),
    })
    .partial()
    .optional(),
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      address: z.string(),
      city: z.string(),
    })
    .optional(),
});

router.patch(
  '/:id/policy',
  authenticate,
  validate({ body: policySchema }),
  asyncHandler(async (req, res) => {
    const fleet = await fleetService.updatePolicy(req.principal!.userId, req.params.id, req.body);
    sendSuccess(res, fleet);
  }),
);

router.post(
  '/:id/policy/apply',
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await fleetService.applyPolicyToVehicles(req.principal!.userId, req.params.id);
    sendSuccess(res, result);
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
