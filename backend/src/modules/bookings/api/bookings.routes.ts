import { Router } from 'express';
import { z } from 'zod';
import { bookingService } from '../application/booking.service';
import { eligibilityService } from '../application/eligibility.service';
import { incidentalsService } from '../application/incidentals.service';
import { riskService } from '../../risk/application/risk.service';
import { ForbiddenError } from '../../../core/errors/app-error';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';
import { quoteSchema, createBookingSchema, cancelSchema, extendSchema } from '../dto/booking.schemas';
import { listProtectionPlans } from '../../pricing/domain/protection-plans';

const router = Router();

// Public: platform protection tiers shown on the vehicle detail page.
router.get(
  '/protection-plans',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await listProtectionPlans());
  }),
);

router.post(
  '/quote',
  authenticate,
  validate({ body: quoteSchema }),
  asyncHandler(async (req, res) => {
    // Pass the caller so CATO Plus benefits are reflected in the quoted price.
    // The lock is a signed promise that this is the price they will be charged:
    // without it, a surge rule activating between "see price" and "confirm"
    // silently charges more than the screen showed.
    const { breakdown, priceLock } = await bookingService.quoteWithLock(
      req.body,
      req.principal!.userId,
    );
    sendSuccess(res, {
      ...breakdown,
      priceLock,
      lockExpiresAt: priceLock ? new Date(priceLock.expiresAt) : undefined,
    });
  }),
);

/**
 * What (if anything) stands between this guest and a car. Drives the booking
 * screen's checklist, so a guest learns they need a licence before they pick
 * dates rather than after they have committed.
 */
router.get(
  '/eligibility',
  authenticate,
  asyncHandler(async (req, res) => {
    const tripEnd = req.query.end ? new Date(String(req.query.end)) : undefined;
    // Register the device here too. The booking call is far too late to start
    // learning which accounts share a handset — by then the ring has already
    // been built and only the last account looks suspicious.
    void riskService.touchDevice({
      userId: req.principal!.userId,
      context: 'login',
      deviceFingerprint: req.device?.fingerprint,
      ip: req.device?.ip,
      userAgent: req.device?.userAgent,
      platform: req.device?.platform,
      emulator: req.device?.emulator,
      rooted: req.device?.rooted,
    });

    const result = await eligibilityService.evaluate(
      req.principal!.userId,
      tripEnd && !Number.isNaN(tripEnd.getTime()) ? tripEnd : undefined,
    );
    sendSuccess(res, {
      ...result,
      messages: eligibilityService.describe(result.blockers),
    });
  }),
);

router.post(
  '/',
  authenticate,
  authorize('booking:create'),
  validate({ body: createBookingSchema }),
  asyncHandler(async (req, res) => {
    const idempotencyKey = req.header('idempotency-key');
    const booking = await bookingService.create(
      req.principal!.userId,
      req.body,
      idempotencyKey,
      undefined,
      { ...req.device, deviceFingerprint: req.device?.fingerprint },
    );
    sendCreated(res, booking);
  }),
);

router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const role = (req.query.role as string) ?? 'guest';
    const cursor = req.query.cursor as string | undefined;
    const page =
      role === 'host'
        ? await bookingService.listForHost(req.principal!.userId, cursor)
        : await bookingService.listForGuest(req.principal!.userId, cursor);
    sendSuccess(res, page.items, 200, { pagination: { nextCursor: page.nextCursor, hasMore: page.hasMore } });
  }),
);

router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const booking = await bookingService.get(req.principal!, req.params.id);
    sendSuccess(res, booking);
  }),
);

router.post(
  '/:id/confirm',
  authenticate,
  asyncHandler(async (req, res) => {
    const booking = await bookingService.confirm(req.principal!.userId, req.params.id);
    sendSuccess(res, booking);
  }),
);

router.post(
  '/:id/decline',
  authenticate,
  asyncHandler(async (req, res) => {
    const booking = await bookingService.decline(req.principal!.userId, req.params.id);
    sendSuccess(res, booking);
  }),
);

/**
 * The exact refund a cancellation would produce right now — shown before the
 * guest commits, the way Turo does. Read-only; changes nothing.
 */
router.get(
  '/:id/cancellation-preview',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await bookingService.cancellationPreview(req.principal!, req.params.id));
  }),
);

/** The exact added cost of extending to a date, before charging. */
router.get(
  '/:id/extension-preview',
  authenticate,
  validate({ query: z.object({ newEnd: z.string() }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await bookingService.extensionPreview(
        req.principal!.userId,
        req.params.id,
        String(req.query.newEnd),
      ),
    );
  }),
);

router.post(
  '/:id/cancel',
  authenticate,
  authorize('booking:cancel:own'),
  validate({ body: cancelSchema }),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.cancel(req.principal!, req.params.id, req.body.reason);
    sendSuccess(res, booking);
  }),
);

/** Declare a no-show — host reports a guest no-show, guest reports a host one. */
router.post(
  '/:id/no-show',
  authenticate,
  validate({ body: z.object({ party: z.enum(['guest', 'host']) }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await bookingService.noShow(req.principal!, req.params.id, req.body.party));
  }),
);

/** Host (or ops) applies post-trip incidentals — cleaning, smoking, tolls, etc. */
router.post(
  '/:id/incidentals',
  authenticate,
  validate({
    body: z.object({
      items: z
        .array(
          z.object({
            type: z.enum(['fuel', 'cleaning', 'smoking', 'pet', 'late_return', 'toll', 'fine', 'other']),
            amount: z.number().int().min(0).optional(),
            qty: z.number().min(0).optional(),
            note: z.string().max(300).optional(),
          }),
        )
        .min(1),
    }),
  }),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.getDoc(req.params.id);
    const isHost = await bookingService.isHostOwner(req.principal!.userId, booking.hostId);
    const isAdmin = req.principal!.permissions.includes('*') || req.principal!.permissions.includes('booking:read:any');
    if (!isHost && !isAdmin) throw new ForbiddenError('Only the host can apply incidentals');
    sendSuccess(res, await incidentalsService.charge(req.params.id, req.body.items, req.principal!.userId));
  }),
);

router.post(
  '/:id/extend',
  authenticate,
  validate({ body: extendSchema }),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.requestExtension(
      req.principal!.userId,
      req.params.id,
      new Date(req.body.newEnd).toISOString(),
    );
    sendSuccess(res, booking);
  }),
);

/** The exact refund for ending a confirmed trip earlier, before committing. */
router.get(
  '/:id/shorten-preview',
  authenticate,
  validate({ query: z.object({ newEnd: z.string() }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await bookingService.shortenPreview(req.principal!.userId, req.params.id, String(req.query.newEnd)),
    );
  }),
);

router.post(
  '/:id/shorten',
  authenticate,
  validate({ body: extendSchema }),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.requestShorten(
      req.principal!.userId,
      req.params.id,
      new Date(req.body.newEnd).toISOString(),
    );
    sendSuccess(res, booking);
  }),
);

/** Add an approved additional driver to the trip (must be before it ends). */
router.post(
  '/:id/drivers',
  authenticate,
  validate({
    body: z.object({ name: z.string().min(2).max(80), licenseNumber: z.string().max(40).optional() }),
  }),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.addDriver(req.principal!.userId, req.params.id, req.body);
    sendSuccess(res, booking);
  }),
);

router.delete(
  '/:id/drivers/:name',
  authenticate,
  asyncHandler(async (req, res) => {
    const booking = await bookingService.removeDriver(
      req.principal!.userId,
      req.params.id,
      decodeURIComponent(req.params.name),
    );
    sendSuccess(res, booking);
  }),
);

export const bookingsRoutes = router;
