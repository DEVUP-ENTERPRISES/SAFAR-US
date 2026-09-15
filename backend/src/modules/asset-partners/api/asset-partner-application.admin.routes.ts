import { Router } from 'express';
import { z } from 'zod';
import { assetPartnerApplicationService } from '../application/asset-partner-application.service';
import { reviewApplicationSchema } from '../dto/asset-partner-application.schemas';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

router.get(
  '/asset-partner-applications',
  authorize('admin:read'),
  validate({
    query: z.object({
      status: z.enum(['submitted', 'under_review', 'approved', 'rejected']).optional(),
      limit: z.coerce.number().int().min(1).max(50).optional(),
      skip: z.coerce.number().int().min(0).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await assetPartnerApplicationService.adminList(req.query as never);
    sendSuccess(res, result.items, 200, { total: result.total });
  }),
);

router.get(
  '/asset-partner-applications/:id',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await assetPartnerApplicationService.adminOne(req.params.id));
  }),
);

/** Approve or reject. Approving is the gate: it verifies the applicant's host
 *  account (creating one if needed) so vehicle.service will let them list. */
router.post(
  '/asset-partner-applications/:id/review',
  authorize('host:manage'),
  validate({ body: reviewApplicationSchema }),
  asyncHandler(async (req, res) => {
    const app = await assetPartnerApplicationService.review(
      req.params.id,
      req.principal!.userId,
      req.body.decision,
      req.body.notes,
    );
    sendSuccess(res, app);
  }),
);

export const assetPartnerApplicationAdminRoutes = router;
