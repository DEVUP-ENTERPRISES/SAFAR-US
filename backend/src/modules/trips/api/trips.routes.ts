import { Router } from 'express';
import { z } from 'zod';
import { tripService, MIN_RETURN_PHOTOS } from '../application/trip.service';
import { hostTripsService } from '../../bookings/application/host-trips.service';
import { vehicleService } from '../../vehicles/application/vehicle.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';
import { tripCarbon } from '../../../shared/utils/carbon';

const router = Router();

/** Client-side rules the trip UI enforces — single source of truth. */
router.get(
  '/requirements',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, { minReturnPhotos: MIN_RETURN_PHOTOS });
  }),
);

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

// ── Host trip screens ─────────────────────────────────────────────────

/** BOOKED tab: upcoming + active trips for the host. */
router.get(
  '/host/booked',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await hostTripsService.booked(req.principal!.userId));
  }),
);

/** HISTORY tab: completed + cancelled trips. */
router.get(
  '/host/history',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await hostTripsService.history(req.principal!.userId));
  }),
);

/** One trip, fully joined (guest, vehicle, mileage, check-in state). */
router.get(
  '/host/booking/:bookingId',
  authenticate,
  asyncHandler(async (req, res) => {
    const trip = await hostTripsService.one(req.principal!.userId, req.params.bookingId);
    sendSuccess(res, trip, trip ? 200 : 404);
  }),
);

router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const trip = await tripService.get(req.params.id);
    // Attach carbon footprint + EV savings (needs the vehicle's fuel type).
    let carbon = null;
    try {
      const v = await vehicleService.getById(trip.vehicleId);
      carbon = tripCarbon(trip.distanceKm ?? 0, v.fuelType);
    } catch {
      /* vehicle gone — omit carbon */
    }
    sendSuccess(res, { ...trip, carbon });
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

router.post(
  '/:id/checkin',
  authenticate,
  validate({ body: z.object({ method: z.enum(['contactless', 'in_person']).default('contactless') }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await tripService.checkIn(req.principal!.userId, req.params.id, req.body.method));
  }),
);

router.post(
  '/:id/damage',
  authenticate,
  validate({
    body: z.object({ description: z.string().min(1).max(1000), photos: z.array(z.string().url()).default([]) }),
  }),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await tripService.reportDamage(req.principal!.userId, req.params.id, req.body.description, req.body.photos),
    );
  }),
);

router.post(
  '/:id/sos',
  authenticate,
  asyncHandler(async (req, res) => {
    await tripService.raiseSos(req.principal!.userId, req.params.id);
    sendSuccess(res, { alerted: true });
  }),
);

/** Host verifies the guest's pickup code at handover. */
router.post(
  '/:id/verify-pickup',
  authenticate,
  validate({ body: z.object({ code: z.string().length(6) }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await tripService.verifyPickup(req.principal!, req.params.id, req.body.code));
  }),
);

/** Raise a structured emergency — pauses the trip until resolved. */
router.post(
  '/:id/incident',
  authenticate,
  validate({
    body: z.object({
      type: z.enum(['accident', 'breakdown', 'medical', 'theft', 'unsafe']),
      note: z.string().max(1000).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await tripService.raiseIncident(req.principal!.userId, req.params.id, req.body.type, req.body.note));
  }),
);

router.post(
  '/:id/incident/resolve',
  authenticate,
  validate({ body: z.object({ note: z.string().max(1000).optional() }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await tripService.resolveIncident(req.principal!.userId, req.params.id, req.body.note));
  }),
);

/** Host confirms the guest's driver's licence (gates the protection plan). */
router.post(
  '/:id/confirm-license',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await tripService.confirmLicense(req.principal!.userId, req.params.id));
  }),
);

/** Record the start odometer/fuel at handover. */
router.post(
  '/:id/handover',
  authenticate,
  validate({
    body: z.object({
      odometerStart: z.number().int().min(0),
      fuelStart: z.number().min(0).max(100).optional(),
      notes: z.string().max(500).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await tripService.startHandover(req.principal!.userId, req.params.id, req.body));
  }),
);

/** Condition photos: `pre` at check-in, `post` at checkout. */
router.post(
  '/:id/photos',
  authenticate,
  validate({
    body: z.object({
      phase: z.enum(['pre', 'post']),
      photos: z.array(z.object({ url: z.string().min(1), key: z.string().optional() })).min(1),
    }),
  }),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await tripService.addPhotos(req.principal!.userId, req.params.id, req.body.phase, req.body.photos),
    );
  }),
);


export const tripsRoutes = router;
