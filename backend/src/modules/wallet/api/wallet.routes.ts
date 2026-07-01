import { Router } from 'express';
import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

/** Balance is DERIVED from the ledger — no mutable balance field. */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const account = Account.userWallet(req.principal!.userId);
    const balance = await ledgerService.balance(account);
    sendSuccess(res, { balance, currency: 'INR' });
  }),
);

router.get(
  '/transactions',
  authenticate,
  asyncHandler(async (req, res) => {
    const account = Account.userWallet(req.principal!.userId);
    sendSuccess(res, await ledgerService.entriesForAccount(account));
  }),
);

export const walletRoutes = router;
