import { Router } from 'express';
import { platformConfigService } from '../application/platform-config.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

/**
 * Guest-safe slice of platform economics — the values the marketplace UI needs
 * to explain terms accurately (cancellation windows, deposit band, early-bird /
 * last-minute windows) so nothing is hardcoded in the client. Deliberately
 * excludes internal rates (tax, payout fees).
 *
 * Two values here are published rather than hidden, on purpose:
 *
 * `protection` — a guest is charged for a protection tier during checkout, so
 * the tiers and their prices have to be explainable before checkout too.
 *
 * `hostTakeRateBps` — the platform's cut. A host deciding whether to list is
 * entitled to know it before they spend an hour on a listing, and every
 * serious competitor publishes theirs. This is the default rate; an individual
 * host's effective rate can be lower if a CommissionRule matches them, so the
 * calculator that reads this shows a floor, never an overstatement of earnings.
 */
router.get(
  '/config',
  asyncHandler(async (_req, res) => {
    const cfg = await platformConfigService.get();
    sendSuccess(res, {
      cancellation: cfg.cancellation,
      deposit: {
        enabled: cfg.deposit.enabled,
        minCents: cfg.deposit.minCents,
        maxCents: cfg.deposit.maxCents,
        multiplierBps: cfg.deposit.multiplierBps,
      },
      pricing: cfg.pricing,
      protection: cfg.protection,
      hostTakeRateBps: cfg.commission.defaultBps,
    });
  }),
);

export const platformConfigPublicRoutes = router;
