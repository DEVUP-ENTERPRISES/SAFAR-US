import { Router } from 'express';
import { z } from 'zod';
import { bookingService } from '../../bookings/application/booking.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

router.get(
  '/bookings',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    const result = await bookingService.adminList({
      status: req.query.status as string,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      skip: req.query.skip ? Number(req.query.skip) : undefined,
    });
    sendSuccess(res, result.items, 200, { total: result.total });
  }),
);

router.get(
  '/bookings/:id',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await bookingService.getDoc(req.params.id));
  }),
);

/** Admin intervention: force-cancel + full refund (finance/refund approval). */
router.post(
  '/bookings/:id/cancel',
  authorize('booking:manage'),
  validate({ body: z.object({ reason: z.string().min(3).max(300) }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await bookingService.adminCancel(req.principal!.userId, req.params.id, req.body.reason));
  }),
);

export const bookingsAdminRoutes = router;
