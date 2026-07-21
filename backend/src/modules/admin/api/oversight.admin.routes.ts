import { Router } from 'express';
import { z } from 'zod';
import { oversightService } from '../application/oversight.service';
import { payoutService } from '../../payouts/application/payout.service';
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

export const oversightAdminRoutes = router;
