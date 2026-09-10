import { Router } from 'express';
import { z } from 'zod';
import { vehicleService, MIN_LISTING_PHOTOS } from '../application/vehicle.service';
import { vehicleInsightsService } from '../application/vehicle-insights.service';
import { fleetImportService } from '../application/fleet-import.service';
import { vehicleHistoryService } from '../application/vehicle-history.service';
import { vehicleLifecycleService } from '../application/vehicle-lifecycle.service';
import { OPERATIONAL_STATES } from '../domain/vehicle-lifecycle';
import { availabilityService } from '../../availability/application/availability.service';
import { searchService } from '../../search/application/search.service';
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

// Smart Price AI — market-based daily price suggestion for hosts.
/** Listing requirements the UI enforces client-side — single source of truth. */
router.get(
  '/requirements',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, { minPhotos: MIN_LISTING_PHOTOS });
  }),
);

router.get(
  '/price-suggestion',
  authenticate,
  validate({
    query: z.object({
      lng: z.coerce.number(),
      lat: z.coerce.number(),
      category: z.string(),
      fuelType: z.string().optional(),
      radiusKm: z.coerce.number().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await vehicleService.priceSuggestion({
        lng: Number(req.query.lng),
        lat: Number(req.query.lat),
        category: String(req.query.category),
        fuelType: req.query.fuelType as string | undefined,
        radiusKm: req.query.radiusKm ? Number(req.query.radiusKm) : undefined,
      }),
    );
  }),
);

/**
 * Fleet import — decode a batch of VINs and report what each row still needs,
 * writing nothing. The host sees their whole fleet resolved before committing.
 */
router.post(
  '/import/preview',
  authenticate,
  validate({ body: z.object({ vins: z.array(z.string().min(11).max(20)).min(1).max(200) }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await fleetImportService.preview(req.principal!.userId, req.body.vins));
  }),
);

/** Create the fleet as drafts. Rows are independent — one bad row costs one row. */
router.post(
  '/import',
  authenticate,
  validate({
    body: z.object({
      rows: z.array(z.object({
        vin: z.string().min(11).max(20),
        dailyPrice: z.number().int().positive(),
        address: z.string().min(4).max(300),
        title: z.string().max(120).optional(),
        description: z.string().max(4000).optional(),
        registrationNumber: z.string().max(32).optional(),
        transmission: z.enum(['manual', 'automatic']).optional(),
        fuelType: z.enum(['petrol', 'diesel', 'hybrid', 'ev']).optional(),
        seats: z.number().int().min(1).max(60).optional(),
        bodyType: z.string().max(40).optional(),
      })).min(1).max(200),
    }),
  }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await fleetImportService.importRows(req.principal!.userId, req.body.rows));
  }),
);

/**
 * Recalls and history for one car.
 *
 * Public: an open safety recall is exactly the thing a guest should be able to
 * see before booking, and hiding it would be the wrong call for a platform that
 * puts strangers in each other's vehicles.
 */
router.get(
  '/:id/history',
  asyncHandler(async (req, res) => {
    const v = await vehicleService.getById(req.params.id);
    sendSuccess(
      res,
      await vehicleHistoryService.full({
        vin: v.vin,
        make: v.make,
        model: v.model,
        year: v.year,
      }),
    );
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const v = await vehicleService.getById(req.params.id);
    sendSuccess(res, v);
  }),
);

/** Similar cars nearby — availability-aware when start/end are supplied. */
/**
 * The full picture for one car — earnings, utilisation, reviews, claims and
 * paperwork in a single read. Owner only: this is the asset's finances.
 */
router.get(
  '/:id/insights',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await vehicleInsightsService.forVehicle(req.principal!.userId, req.params.id));
  }),
);

router.get(
  '/:id/similar',
  validate({ query: z.object({ start: z.string().optional(), end: z.string().optional(), limit: z.coerce.number().int().min(1).max(12).optional() }) }),
  asyncHandler(async (req, res) => {
    const start = req.query.start ? new Date(String(req.query.start)) : undefined;
    const end = req.query.end ? new Date(String(req.query.end)) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 8;
    sendSuccess(res, await searchService.similarTo(req.params.id, { start, end, limit }));
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

/**
 * Photo keys are opaque paths containing slashes, so they travel in the body
 * rather than the URL — a path segment would need double-encoding and breaks
 * behind proxies that normalise %2F.
 */
router.delete(
  '/:id/photos',
  authenticate,
  authorize('vehicle:update:own'),
  validate({ body: z.object({ key: z.string().min(3).max(512) }) }),
  asyncHandler(async (req, res) => {
    const v = await vehicleService.removePhoto(req.principal!.userId, req.params.id, req.body.key);
    sendSuccess(res, v);
  }),
);

router.put(
  '/:id/photos/cover',
  authenticate,
  authorize('vehicle:update:own'),
  validate({ body: z.object({ key: z.string().min(3).max(512) }) }),
  asyncHandler(async (req, res) => {
    const v = await vehicleService.setCoverPhoto(req.principal!.userId, req.params.id, req.body.key);
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

// ── Vehicle lifecycle & master timeline ──────────────────────────────────

const STAFF_ROLES = ['admin', 'super_admin', 'ops', 'support', 'staff'];

/**
 * The vehicle's operational timeline (§21). The host owner sees their own car's
 * history; staff can see any car's. Everything that ever happened to the car,
 * newest first.
 */
router.get(
  '/:id/timeline',
  authenticate,
  validate({
    query: z.object({
      limit: z.coerce.number().int().positive().max(200).optional(),
      beforeSeq: z.coerce.number().int().positive().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const isStaff = (req.principal!.roles ?? []).some((r) => STAFF_ROLES.includes(r));
    if (!isStaff) await vehicleService.assertOwnerById(req.principal!.userId, req.params.id);
    const events = await vehicleLifecycleService.timeline(req.params.id, {
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      beforeSeq: req.query.beforeSeq ? Number(req.query.beforeSeq) : undefined,
    });
    sendSuccess(res, events);
  }),
);

/**
 * Ops-driven operational transition (cleaning → maintenance → repair →
 * reactivation, safety holds, …). Gated to staff: a host must never reactivate
 * a car out of a safety/compliance hold themselves (§19). The state machine
 * validates the move; the service makes it auditable and idempotent.
 */
router.post(
  '/:id/lifecycle/transition',
  authenticate,
  authorize('vehicle:verify'),
  validate({
    body: z.object({
      to: z.enum(OPERATIONAL_STATES as unknown as [string, ...string[]]),
      reason: z.string().max(500).optional(),
      evidence: z
        .array(
          z.object({
            kind: z.string().max(40),
            url: z.string().url().optional(),
            key: z.string().max(400).optional(),
            ref: z.string().max(200).optional(),
            label: z.string().max(200).optional(),
          }),
        )
        .max(30)
        .optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await vehicleLifecycleService.transition({
      vehicleId: req.params.id,
      to: req.body.to,
      actor: { userId: req.principal!.userId, roles: req.principal!.roles },
      reason: req.body.reason,
      evidence: req.body.evidence,
    });
    sendSuccess(res, result);
  }),
);

export const vehiclesRoutes = router;
