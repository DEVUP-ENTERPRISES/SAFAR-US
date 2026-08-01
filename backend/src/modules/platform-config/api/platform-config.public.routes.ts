import { Router } from 'express';
import { platformConfigService } from '../application/platform-config.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

/**
 * Guest-safe slice of platform economics — the values the marketplace UI needs
 * to explain terms accurately (cancellation windows, deposit band, early-bird /
 * last-minute windows) so nothing is hardcoded in the client. Deliberately
 * excludes internal rates (commission, tax, payout fees).
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
    });
  }),
);

export const platformConfigPublicRoutes = router;
