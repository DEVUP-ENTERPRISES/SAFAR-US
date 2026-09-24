import { Router } from 'express';
import { adminMetricsService } from '../application/admin-metrics.service';
import { visitorTrackingService } from '../../analytics/application/visitor-tracking.service';
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

/** Trend, demand mix and conversion for the Analytics view. */
router.get(
  '/analytics',
  authorize('analytics:read'),
  asyncHandler(async (req, res) => {
    const raw = Number(req.query.days);
    // Clamp: an unbounded window lets one query scan the whole booking history.
    const days = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 180) : 30;
    sendSuccess(res, await adminMetricsService.analytics(days));
  }),
);

/** Live visitor/traffic-source view — who's on the site right now, and where from. */
router.get(
  '/analytics/live-traffic',
  authorize('analytics:read'),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await visitorTrackingService.liveSummary());
  }),
);

/** Aggregated visitor locations for the Geo Intelligence heatmap. */
router.get(
  '/analytics/geo',
  authorize('analytics:read'),
  asyncHandler(async (req, res) => {
    const raw = Number(req.query.days);
    const days = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 90) : 30;
    sendSuccess(res, await visitorTrackingService.geoSummary(days));
  }),
);

export const metricsAdminRoutes = router;
