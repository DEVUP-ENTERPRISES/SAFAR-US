import { Router } from 'express';
import { payoutService } from '../application/payout.service';
import { payoutReadinessService } from '../application/payout-readiness.service';
import { hostService } from '../../hosts/application/host.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { sendSuccess } from '../../../shared/http/api-response';
import { connectService } from '../application/connect.service';
import { config } from '../../../config';
import { z } from 'zod';
import { validate } from '../../../shared/middleware/validate';

const router = Router();

/** Can this host get paid, and what is standing in the way? */
router.get(
  '/readiness',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await payoutReadinessService.forHost(req.principal!.userId));
  }),
);

/** Host views own payouts. */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const host = await hostService.requireHostForUser(req.principal!.userId);
    sendSuccess(res, await payoutService.listForHost(host._id));
  }),
);

/** Host cashes out all scheduled earnings instantly (for a fee). */
router.post(
  '/instant',
  authenticate,
  asyncHandler(async (req, res) => {
    const host = await hostService.requireHostForUser(req.principal!.userId);
    sendSuccess(res, await payoutService.instantPayout(host._id));
  }),
);

/** Finance triggers a payout run for a host. */
router.post(
  '/run/:hostId',
  authenticate,
  authorize('payment:refund'),
  asyncHandler(async (req, res) => {
    const result = await payoutService.runForHost(req.params.hostId);
    sendSuccess(res, result);
  }),
);

// ── Stripe Connect: how a host actually receives money ───────────────

/** Whether this host can be paid, read from Stripe rather than assumed. */
router.get(
  '/connect/status',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await connectService.status(req.principal!.userId));
  }),
);

/**
 * A fresh onboarding link. Account links are single-use and expire in minutes,
 * so one is minted per request — a stored link is a broken link.
 */
router.post(
  '/connect/onboard',
  authenticate,
  validate({ body: z.object({ returnPath: z.string().max(200).optional() }).partial() }),
  asyncHandler(async (req, res) => {
    // Built from the configured origin, never from a caller-supplied URL: an
    // open redirect on a payment onboarding flow is a phishing gift.
    const origin = config.cors.origins.find((o) => o !== '*') ?? config.app.publicUrl;
    const path = (req.body?.returnPath as string) ?? '/host/earnings';
    const safePath = path.startsWith('/') ? path : '/host/earnings';
    sendSuccess(
      res,
      await connectService.createOnboardingLink(
        req.principal!.userId,
        `${origin}${safePath}?connect=done`,
        `${origin}${safePath}?connect=retry`,
      ),
    );
  }),
);

/** Stripe's own dashboard, for changing bank details. */
router.post(
  '/connect/dashboard',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await connectService.dashboardLink(req.principal!.userId));
  }),
);

export const payoutsRoutes = router;
