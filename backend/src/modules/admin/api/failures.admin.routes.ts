import { Router } from 'express';
import { requestFailureService } from '../../ops/application/request-failure.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

/** Failed booking, payment and identity attempts, plus every server error, newest first with a count per error. */
router.get(
  '/failures',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await requestFailureService.list({
      area: (req.query.area as string) || undefined,
      days: req.query.days ? Number(req.query.days) : undefined,
    }));
  }),
);

export const failuresAdminRoutes = router;
