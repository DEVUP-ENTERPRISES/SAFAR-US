import { Router } from 'express';
import { bookingService } from '../application/booking.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';
import { quoteSchema, createBookingSchema, cancelSchema } from '../dto/booking.schemas';

const router = Router();

router.post(
  '/quote',
  authenticate,
  validate({ body: quoteSchema }),
  asyncHandler(async (req, res) => {
    const breakdown = await bookingService.quote(req.body);
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

export const bookingsRoutes = router;
