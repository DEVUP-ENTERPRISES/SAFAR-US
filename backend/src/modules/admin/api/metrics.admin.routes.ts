import { Router } from 'express';
import { adminMetricsService } from '../application/admin-metrics.service';
import { bookingService } from '../../bookings/application/booking.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

router.get(
  '/metrics',
  authorize('admin:read'),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await adminMetricsService.dashboard());
  }),
);

/** Time-series analytics for the dashboard chart. */
router.get(
  '/analytics',
  authorize('analytics:read'),
  asyncHandler(async (req, res) => {
    const days = req.query.days ? Number(req.query.days) : 14;
    sendSuccess(res, await bookingService.dailySeries(days));
  }),
);

export const metricsAdminRoutes = router;
