import { Router } from 'express';
import { z } from 'zod';
import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';
import { walletService } from '../application/wallet.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

/** Balance is DERIVED from the ledger — no mutable balance field. */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const account = Account.userWallet(req.principal!.userId);
    const balance = await ledgerService.balance(account);
    sendSuccess(res, { balance, currency: 'USD' });
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

router.post(
  '/topup',
  authenticate,
  validate({ body: z.object({ amount: z.number().int().min(100) }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await walletService.topup(req.principal!.userId, req.body.amount));
  }),
);

export const walletRoutes = router;
