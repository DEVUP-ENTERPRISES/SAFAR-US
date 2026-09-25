import { Router } from 'express';
import { z } from 'zod';
import { tripService } from '../application/trip.service';
import { hostTripsService } from '../../bookings/application/host-trips.service';
import { vehicleService } from '../../vehicles/application/vehicle.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';
import { tripCarbon } from '../../../shared/utils/carbon';
import { handoverService } from '../application/handover.service';
import { trackingPhaseService } from '../application/tracking-phase.service';
import { ForbiddenError } from '../../../core/errors/app-error';
import { platformConfigService } from '../../platform-config/application/platform-config.service';

const router = Router();

/** Client-side rules the trip UI enforces — single source of truth. */
router.get(
  '/requirements',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, { minReturnPhotos: (await platformConfigService.get()).inspection.minReturnPhotos });
  }),
);

const startSchema = z.object({
  bookingId: z.string().min(1),
  odometerStart: z.number().int().min(0).optional(),
  fuelStart: z.number().min(0).max(100).optional(),
  notes: z.string().max(500).optional(),
  licenceConfirmed: z.boolean().optional(),
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
    const trip = await tripService.start(req.principal!, bookingId, handover);
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

// `.strict()` so a client can never smuggle in its own `at`, `byUserId` or `source`.
const photoSchema = z
  .object({
    url: z.string().min(1).max(1024),
    key: z.string().min(1).max(512),
    angle: z.string().min(1).max(40),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    accuracyM: z.number().min(0).max(100000).optional(),
    capturedAtClient: z.string().datetime().optional(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  })
  .strict();
const photosBody = z.object({ phase: z.enum(['pre', 'post']), photos: z.array(photoSchema).min(1).max(10) }).strict();

/** Window and photo state for a booking, before or after its trip exists. */
router.get(
  '/booking/:bookingId/inspection',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await tripService.inspection(req.principal!.userId, req.params.bookingId));
  }),
);

/** Condition photos for a booking: `pre` from the pickup window, `post` from the return window. */
router.post(
  '/booking/:bookingId/photos',
  authenticate,
  validate({ body: photosBody }),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await tripService.addPhotos(req.principal!.userId, req.params.bookingId, req.body.phase, req.body.photos),
    );
  }),
);

/** Host verifies the guest's pickup code before the trip exists. */
router.post(
  '/booking/:bookingId/verify-pickup',
  authenticate,
  validate({ body: z.object({ code: z.string().length(6) }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await tripService.verifyPickupForBooking(req.principal!, req.params.bookingId, req.body.code));
  }),
);

router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const trip = await tripService.get(req.params.id);
    // tripService.get does NOT authorize — any signed-in user could read any
    // trip, including both parties' ids, live location, odometer and photos.
    const uid = req.principal!.userId;
    const isStaff = !!req.principal?.permissions?.some((p) => p === '*' || p === 'booking:read:any');
    const hostSide = trip.guestId !== uid && (await tripService.isHostSideOf(uid, trip));
    if (trip.guestId !== uid && !hostSide && !isStaff) {
      throw new ForbiddenError('Not your trip');
    }
    // Attach carbon footprint + EV savings (needs the vehicle's fuel type).
    let carbon = null;
    try {
      const v = await vehicleService.getById(trip.vehicleId);
      carbon = tripCarbon(trip.distanceKm ?? 0, v.fuelType);
    } catch {
      /* vehicle gone — omit carbon */
    }
    const inspection = trip.guestId === uid || hostSide ? await tripService.inspection(uid, trip.bookingId) : null;
    sendSuccess(res, { ...trip, carbon, inspection });
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
    const uid = req.principal!.userId;
    // The role was derived by elimination — anyone who was not the host was
    // treated as the guest, including a stranger. updateLocation below does
    // reject them, so nothing could be written, but the phase check still ran
    // first and its answer leaked back: a signed-in third party could probe any
    // trip id and learn whether tracking was currently open on it.
    if (trip.guestId !== uid && trip.hostId !== uid) {
      throw new ForbiddenError('Not your trip');
    }
    const role = trip.hostId === uid ? 'host' : 'guest';
    if (!(await trackingPhaseService.mayBroadcast(trip.bookingId, role))) {
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

/** Host side confirms a guest-ended return, optionally correcting the readings. */
router.post(
  '/:id/confirm-return',
  authenticate,
  validate({ body: z.object({ odometerEnd: z.number().int().min(0).optional(), fuelEnd: z.number().min(0).max(100).optional() }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await tripService.confirmReturn(req.principal!, req.params.id, req.body));
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

/** Same as the booking route, addressed by trip id. */
router.post(
  '/:id/photos',
  authenticate,
  validate({ body: photosBody }),
  asyncHandler(async (req, res) => {
    const trip = await tripService.get(req.params.id);
    sendSuccess(
      res,
      await tripService.addPhotos(req.principal!.userId, trip.bookingId, req.body.phase, req.body.photos),
    );
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
