import { Router } from 'express';
import { z } from 'zod';
import { userRepository } from '../../users/infrastructure/user.repository';
import { hostService } from '../../hosts/application/host.service';
import { bookingService } from '../../bookings/application/booking.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';
import { NotFoundError } from '../../../core/errors/app-error';

const router = Router();

router.get(
  '/users',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    const page = await userRepository.adminList({
      q: req.query.q as string,
      status: req.query.status as string,
      role: req.query.role as string,
      cursor: req.query.cursor as string,
    });
    sendSuccess(res, page.items, 200, { pagination: { nextCursor: page.nextCursor, hasMore: page.hasMore } });
  }),
);

/** User 360 — profile, host profile, recent bookings, simple risk signals. */
router.get(
  '/users/:id',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    const user = await userRepository.findById(req.params.id);
    if (!user) throw new NotFoundError('User');
    const [host, bookings] = await Promise.all([
      hostService.getByUserId(user._id),
      bookingService.listForGuest(user._id, undefined, 10),
    ]);

    const cancelled = bookings.items.filter((b) => b.status === 'cancelled').length;
    const riskFlags: string[] = [];
    if (user.status !== 'active') riskFlags.push(`account_${user.status}`);
    if (bookings.items.length >= 5 && cancelled / bookings.items.length > 0.5) riskFlags.push('high_cancel_rate');
    if (!user.emailVerified && !user.phoneVerified) riskFlags.push('unverified_contact');

    sendSuccess(res, { user, host, bookings: bookings.items, riskFlags });
  }),
);

router.post(
  '/users/:id/status',
  authorize('user:manage'),
  validate({ body: z.object({ status: z.enum(['active', 'suspended', 'banned']) }) }),
  asyncHandler(async (req, res) => {
    const user = await userRepository.findById(req.params.id);
    if (!user) throw new NotFoundError('User');
    await userRepository.setStatus(req.params.id, req.body.status);
    sendSuccess(res, { id: req.params.id, status: req.body.status });
  }),
);

export const usersAdminRoutes = router;
