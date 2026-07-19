import { Router } from 'express';
import { z } from 'zod';
import { claimService } from '../../claims/application/claim.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

router.get(
  '/claims',
  authorize('claim:manage'),
  asyncHandler(async (req, res) => {
    const result = await claimService.adminList({
      status: req.query.status as string,
      type: req.query.type as string,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      skip: req.query.skip ? Number(req.query.skip) : undefined,
    });
    sendSuccess(res, result.items, 200, { total: result.total });
  }),
);

router.post(
  '/claims/:id/assign',
  authorize('claim:manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await claimService.assign(req.params.id, req.principal!.userId));
  }),
);

router.post(
  '/claims/:id/resolve',
  authorize('claim:manage'),
  validate({
    body: z.object({
      decision: z.enum(['approved', 'rejected', 'settled']),
      note: z.string().max(500).optional(),
      amountApproved: z.number().int().min(0).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await claimService.resolve(
        req.params.id,
        req.principal!.userId,
        req.body.decision,
        req.body.note,
        req.body.amountApproved,
      ),
    );
  }),
);

/** Settle a claim for real: pay the claimant, penalise the party at fault. */
router.post(
  '/claims/:id/settle',
  authorize('claim:manage'),
  validate({
    body: z.object({
      amountApproved: z.number().int().min(0),
      note: z.string().min(3).max(500),
      liableUserId: z.string().optional(),
      penaltyCents: z.number().int().min(0).optional(),
      warning: z.boolean().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await claimService.settle(req.params.id, req.principal!.userId, req.body));
  }),
);

export const claimsAdminRoutes = router;