import { Router } from 'express';
import { z } from 'zod';
import { hostService } from '../../hosts/application/host.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

router.get(
  '/hosts',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    const result = await hostService.adminList({
      q: req.query.q as string,
      status: req.query.status as string,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      skip: req.query.skip ? Number(req.query.skip) : undefined,
    });
    sendSuccess(res, result.items, 200, { total: result.total });
  }),
);

router.post(
  '/hosts/:id/verification',
  authorize('host:manage'),
  validate({ body: z.object({ status: z.enum(['pending', 'verified', 'rejected']) }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await hostService.setVerification(req.params.id, req.body.status));
  }),
);

export const hostsAdminRoutes = router;
