import { Router } from 'express';
import { z } from 'zod';
import { oversightService } from '../application/oversight.service';
import { payoutService } from '../../payouts/application/payout.service';
import { documentComplianceService } from '../../documents/application/document-compliance.service';
import { maintenanceService } from '../../maintenance/application/maintenance.service';
import { hostService } from '../../hosts/application/host.service';
import { bookingService } from '../../bookings/application/booking.service';
import { reviewService } from '../../reviews/application/review.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

/**
 * Cross-tenant management. Each section is gated by the SAME permission its
 * nav entry declares, so hiding a sidebar item and blocking its data are never
 * out of step — the UI can't be the only thing protecting a route.
 */

// ── Fleets (fleet:manage) ─────────────────────────────────────────────
router.get(
  '/fleets',
  authorize('fleet:manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await oversightService.fleets({ search: req.query.search as string }));
  }),
);

// ── Corporate accounts (corporate:manage) ─────────────────────────────
router.get(
  '/corporate/orgs',
  authorize('corporate:manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await oversightService.orgs({ status: req.query.status as string }));
  }),
);

router.post(
  '/corporate/orgs/:id/status',
  authorize('corporate:manage'),
  validate({ body: z.object({ status: z.enum(['active', 'suspended']) }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await oversightService.setOrgStatus(req.params.id, req.body.status));
  }),
);

// ── Reviews moderation (review:moderate) ──────────────────────────────
router.get(
  '/reviews',
  authorize('review:moderate'),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await oversightService.reviews({
        status: req.query.status as string,
        minRating: req.query.minRating ? Number(req.query.minRating) : undefined,
      }),
    );
  }),
);

router.post(
  '/reviews/:id/status',
  authorize('review:moderate'),
  validate({ body: z.object({ status: z.enum(['published', 'hidden']) }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await oversightService.setReviewStatus(req.params.id, req.body.status));
  }),
);

// ── Payouts (payout:manage) ───────────────────────────────────────────
router.get(
  '/payouts',
  authorize('payout:manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await oversightService.payouts({ status: req.query.status as string }));
  }),
);

/** Release every payout that is past its hold window. */
router.post(
  '/payouts/run-due',
  authorize('payout:manage'),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await payoutService.runAllDue());
  }),
);

/** Force a document-compliance sweep now — pause cars with lapsed insurance/
 *  registration and relist ones renewed since the last run. */
router.post(
  '/compliance/sweep',
  authorize('vehicle:verify'),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await documentComplianceService.sweep());
  }),
);

/** Send maintenance-due reminders now. */
router.post(
  '/maintenance/run-reminders',
  authorize('vehicle:verify'),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, { reminded: await maintenanceService.remindDue() });
  }),
);

/**
 * Run the booking-expiry sweep now.
 *
 * It is scheduled every 5 minutes, but a stuck request holds a guest's card
 * authorisation and a host's calendar — ops needs to be able to clear it
 * immediately rather than wait for the next tick.
 */
router.post(
  '/bookings/run-expiry',
  authorize('booking:manage'),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, { expired: await bookingService.expirePending() });
  }),
);

/**
 * Release reviews whose blind window has closed, now.
 *
 * Scheduled hourly, but a support agent chasing "why can't I see my review"
 * needs to be able to answer it in the moment rather than wait for the tick.
 */
router.post(
  '/reviews/release-expired',
  authorize('review:moderate'),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, { released: await reviewService.releaseExpired() });
  }),
);

/** Re-evaluate a host's All-Star (Superhost) status against the live bar. */
router.post(
  '/hosts/:id/recompute-superhost',
  authorize('vehicle:verify'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, { superhost: await hostService.recomputeSuperhost(req.params.id) });
  }),
);

export const oversightAdminRoutes = router;
