import { Router } from 'express';
import { z } from 'zod';
import { vehicleService } from '../application/vehicle.service';
import { availabilityService } from '../../availability/application/availability.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';
import {
  createVehicleSchema,
  updateVehicleSchema,
  pricingSchema,
  photosSchema,
} from '../dto/vehicle.schemas';

const router = Router();

router.post(
  '/',
  authenticate,
  authorize('vehicle:create'),
  validate({ body: createVehicleSchema }),
  asyncHandler(async (req, res) => {
    const v = await vehicleService.create(req.principal!.userId, req.body);
    sendCreated(res, v);
  }),
);

router.get(
  '/me/list',
  authenticate,
  asyncHandler(async (req, res) => {
    const list = await vehicleService.listByUser(req.principal!.userId);
    sendSuccess(res, list);
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const v = await vehicleService.getById(req.params.id);
    sendSuccess(res, v);
  }),
);

router.patch(
  '/:id',
  authenticate,
  authorize('vehicle:update:own'),
  validate({ body: updateVehicleSchema }),
  asyncHandler(async (req, res) => {
    const v = await vehicleService.update(req.principal!.userId, req.params.id, req.body);
    sendSuccess(res, v);
  }),
);

router.post(
  '/:id/submit',
  authenticate,
  authorize('vehicle:update:own'),
  asyncHandler(async (req, res) => {
    const v = await vehicleService.submit(req.principal!.userId, req.params.id);
    sendSuccess(res, v);
  }),
);

router.delete(
  '/:id',
  authenticate,
  authorize('vehicle:update:own'),
  asyncHandler(async (req, res) => {
    await vehicleService.delist(req.principal!.userId, req.params.id);
    sendSuccess(res, { delisted: true });
  }),
);

// ── Pricing engine ────────────────────────────────────────────────────
router.put(
  '/:id/pricing',
  authenticate,
  authorize('vehicle:update:own'),
  validate({ body: pricingSchema }),
  asyncHandler(async (req, res) => {
    const v = await vehicleService.updatePricing(req.principal!.userId, req.params.id, req.body);
    sendSuccess(res, v);
  }),
);

// ── Photos ────────────────────────────────────────────────────────────
router.post(
  '/:id/photos',
  authenticate,
  authorize('vehicle:update:own'),
  validate({ body: photosSchema }),
  asyncHandler(async (req, res) => {
    const v = await vehicleService.addPhotos(req.principal!.userId, req.params.id, req.body.photos);
    sendSuccess(res, v);
  }),
);

// ── VIN verification ──────────────────────────────────────────────────
router.post(
  '/:id/verify-vin',
  authenticate,
  authorize('vehicle:update:own'),
  validate({ body: z.object({ vin: z.string().min(11).max(17) }) }),
  asyncHandler(async (req, res) => {
    const v = await vehicleService.verifyVin(req.principal!.userId, req.params.id, req.body.vin);
    sendSuccess(res, v);
  }),
);

// ── Availability calendar ─────────────────────────────────────────────
router.get(
  '/:id/availability',
  asyncHandler(async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : new Date();
    const to = req.query.to
      ? new Date(String(req.query.to))
      : new Date(Date.now() + 60 * 86_400_000);
    const cal = await availabilityService.getCalendar(req.params.id, from, to);
    sendSuccess(res, cal);
  }),
);

const blockSchema = z.object({
  start: z.coerce.date(),
  end: z.coerce.date(),
  action: z.enum(['block', 'unblock']).default('block'),
});

router.put(
  '/:id/availability',
  authenticate,
  authorize('vehicle:update:own'),
  validate({ body: blockSchema }),
  asyncHandler(async (req, res) => {
    // Ownership is enforced by loading the vehicle first.
    await vehicleService.assertOwnerById(req.principal!.userId, req.params.id);
    if (req.body.action === 'unblock') {
      await availabilityService.unblock(req.params.id, req.body.start, req.body.end);
    } else {
      await availabilityService.block(req.params.id, req.body.start, req.body.end);
    }
    sendSuccess(res, { updated: true });
  }),
);

// Ops verification
router.post(
  '/:id/verify',
  authenticate,
  authorize('vehicle:verify'),
  asyncHandler(async (req, res) => {
    const v = await vehicleService.verify(req.params.id);
    sendSuccess(res, v);
  }),
);

export const vehiclesRoutes = router;
