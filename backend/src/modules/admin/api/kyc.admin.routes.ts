import { Router } from 'express';
import { z } from 'zod';
import { kycService } from '../../kyc/application/kyc.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

router.get(
  '/kyc',
  authorize('kyc:review'),
  asyncHandler(async (req, res) => {
    const result = await kycService.adminList({
      status: (req.query.status as string) ?? 'pending',
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      skip: req.query.skip ? Number(req.query.skip) : undefined,
    });
    sendSuccess(res, result.items, 200, { total: result.total });
  }),
);

router.post(
  '/kyc/:id/review',
  authorize('kyc:review'),
  validate({ body: z.object({ decision: z.enum(['approved', 'rejected']), reason: z.string().max(300).optional() }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await kycService.review(req.params.id, req.principal!.userId, req.body.decision, req.body.reason));
  }),
);

export const kycAdminRoutes = router;
