import { Router } from 'express';
import { earningsService } from '../application/earnings.service';
import { hostService } from '../../hosts/application/host.service';
import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

router.get(
  '/dashboard',
  authenticate,
  asyncHandler(async (req, res) => {
    const host = await hostService.requireHostForUser(req.principal!.userId);
    sendSuccess(res, await earningsService.dashboard(host._id));
  }),
);

/** Revenue report: recent ledger entries for the host payable account. */
router.get(
  '/report',
  authenticate,
  asyncHandler(async (req, res) => {
    const host = await hostService.requireHostForUser(req.principal!.userId);
    const entries = await ledgerService.entriesForAccount(Account.hostPayable(host._id), 200);
    sendSuccess(res, entries);
  }),
);

export const earningsRoutes = router;
