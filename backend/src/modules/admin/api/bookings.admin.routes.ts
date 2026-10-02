import { Router } from 'express';
import { z } from 'zod';
import { bookingService } from '../../bookings/application/booking.service';
import { messageService } from '../../messaging/application/message.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';
import { adminBookingOverviewService } from '../../bookings/application/admin-booking-overview.service';
import { guestIdentityCheckService } from '../../trips/application/guest-identity-check.service';
import { viewerOf, noStore } from '../../../shared/http/viewer';

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

/** The booking with its car, host and guest (identity summary, no photos). */
router.get(
  '/bookings/:id/overview',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    noStore(res);
    const p = req.principal!.permissions;
    sendSuccess(res, await adminBookingOverviewService.overview(req.params.id, p.includes('*') || p.includes('kyc:review')));
  }),
);

/** Open the guest's ID photos for a timed view; the reason goes to the audit log. */
router.post(
  '/bookings/:id/guest-id/open',
  authorize('kyc:review'),
  validate({ body: z.object({ reason: z.string().trim().min(5).max(200) }).strict() }),
  asyncHandler(async (req, res) => {
    noStore(res);
    sendSuccess(res, await adminBookingOverviewService.openId(viewerOf(req), req.params.id, req.body.reason));
  }),
);

router.post(
  '/bookings/:id/guest-id/file',
  authorize('kyc:review'),
  validate({ body: z.object({ token: z.string().min(20).max(100), kind: z.enum(['selfie', 'licence_front', 'licence_back']) }).strict() }),
  asyncHandler(async (req, res) => {
    noStore(res);
    sendSuccess(res, await adminBookingOverviewService.idFile(viewerOf(req), req.params.id, req.body.token, req.body.kind));
  }),
);

/** Staff checked the guest after the host's "not the same person": the trip can start again. */
router.post(
  '/bookings/:id/identity-check/clear',
  authorize('kyc:review'),
  validate({ body: z.object({ reason: z.string().trim().min(5).max(300) }).strict() }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await guestIdentityCheckService.clear(viewerOf(req), req.params.id, req.body.reason));
  }),
);

/** Read-only host↔guest thread for a booking — for investigating disputes. */
router.get(
  '/bookings/:id/messages',
  authorize('booking:manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await messageService.adminThread(req.params.id));
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
