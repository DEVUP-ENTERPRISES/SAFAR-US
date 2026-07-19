import { Router } from 'express';
import { payoutService } from '../application/payout.service';
import { hostService } from '../../hosts/application/host.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

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

export const payoutsRoutes = router;
