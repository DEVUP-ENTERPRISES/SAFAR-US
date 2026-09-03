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
import { handoverService } from '../application/handover.service';
import { trackingPhaseService } from '../application/tracking-phase.service';
import { trackingNoticeService } from '../application/tracking-notice.service';
import { approachService } from '../application/approach.service';
import { ForbiddenError } from '../../../core/errors/app-error';

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
    // Same gate as the socket path: the server decides when tracking is open,
    // so a stale client cannot keep a position flowing mid-hire.
    const trip = await tripService.get(req.params.id);
    const role = trip.hostId === req.principal!.userId ? 'host' : 'guest';
    if (!(await trackingPhaseService.mayBroadcast(req.params.id, role))) {
      sendSuccess(res, { updated: false, reason: 'Location sharing is not open for this trip right now' });
      return;
    }
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


/**
 * The approach: who has set off, who has arrived, current ETAs, and how to
 * find the car. This is what replaces the "where are you?" messages.
 */
router.get(
  '/:id/approach',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await approachService.state(req.params.id, req.principal!.userId));
  }),
);

/** One tap. The other party is notified and the map goes live. */
router.post(
  '/:id/on-my-way',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await approachService.setOnWay(req.params.id, req.principal!.userId));
  }),
);

/**
 * Whether tracking is open for this trip, and why.
 *
 * Both clients read this before streaming or rendering a map, so the reason a
 * map is on screen is always something the server said — never an assumption
 * the UI made.
 */
router.get(
  '/:id/tracking',
  authenticate,
  asyncHandler(async (req, res) => {
    const uid = req.principal!.userId;
    const trip = await tripService.get(req.params.id);
    if (trip.guestId !== uid && trip.hostId !== uid) throw new ForbiddenError('Not your trip');
    sendSuccess(res, await trackingNoticeService.resolveAndAnnounce(req.params.id));
  }),
);

/**
 * The handover countdown. Both parties call this and read the same clock: the
 * guest gets navigation to the car, the host gets when to leave, both derived
 * from the guest's live position rather than the nominal booking time.
 */
router.get(
  '/:id/handover',
  authenticate,
  validate({ query: z.object({ lat: z.coerce.number(), lng: z.coerce.number() }).partial() }),
  asyncHandler(async (req, res) => {
    const uid = req.principal!.userId;
    const trip = await tripService.get(req.params.id);
    // tripService.get does not authorize, so the party check happens here.
    if (trip.guestId !== uid && trip.hostId !== uid) {
      throw new ForbiddenError('Not your trip');
    }
    const viewer = trip.hostId === uid ? 'host' : 'guest';
    const lat = req.query.lat === undefined ? undefined : Number(req.query.lat);
    const lng = req.query.lng === undefined ? undefined : Number(req.query.lng);
    const from = lat !== undefined && lng !== undefined ? { lat, lng } : undefined;
    sendSuccess(res, await handoverService.status(req.params.id, viewer, from));
  }),
);

export const tripsRoutes = router;
