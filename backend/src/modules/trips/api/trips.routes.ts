import { Router } from 'express';
import { z } from 'zod';
import { tripService } from '../application/trip.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';

const router = Router();

const startSchema = z.object({
  bookingId: z.string().min(1),
  odometerStart: z.number().int().min(0).optional(),
  fuelStart: z.number().min(0).max(100).optional(),
  notes: z.string().max(500).optional(),
});

const locationSchema = z.object({
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
});

const completeSchema = z.object({
  odometerEnd: z.number().int().min(0).optional(),
  fuelEnd: z.number().min(0).max(100).optional(),
  notes: z.string().max(500).optional(),
});

router.post(
  '/start',
  authenticate,
  validate({ body: startSchema }),
  asyncHandler(async (req, res) => {
    const { bookingId, ...handover } = req.body;
    const trip = await tripService.start(req.principal!.userId, bookingId, handover);
    sendCreated(res, trip);
  }),
);

router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await tripService.get(req.params.id));
  }),
);

router.post(
  '/:id/location',
  authenticate,
  validate({ body: locationSchema }),
  asyncHandler(async (req, res) => {
    await tripService.updateLocation(req.principal!.userId, req.params.id, req.body.lng, req.body.lat);
    sendSuccess(res, { updated: true });
  }),
);

router.post(
  '/:id/complete',
  authenticate,
  validate({ body: completeSchema }),
  asyncHandler(async (req, res) => {
    const trip = await tripService.complete(req.principal!.userId, req.params.id, req.body);
    sendSuccess(res, trip);
  }),
);

export const tripsRoutes = router;
