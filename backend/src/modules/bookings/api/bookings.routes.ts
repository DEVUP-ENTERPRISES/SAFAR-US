import { Router } from 'express';
import { z } from 'zod';
import { bookingService } from '../application/booking.service';
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
    const breakdown = await bookingService.quote(req.body, req.principal!.userId);
    sendSuccess(res, breakdown);
  }),
);

router.post(
  '/',
  authenticate,
  authorize('booking:create'),
  validate({ body: createBookingSchema }),
  asyncHandler(async (req, res) => {
    const idempotencyKey = req.header('idempotency-key');
    const booking = await bookingService.create(req.principal!.userId, req.body, idempotencyKey);
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
