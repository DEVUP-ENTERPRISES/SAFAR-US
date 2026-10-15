import { Router } from 'express';
import { z } from 'zod';
import { assetPartnerApplicationAdminRoutes } from './asset-partner-application.admin.routes';
import { assetPartnerAdminRoutes } from './asset-partner.admin.routes';
import { assetPartnerAgreementService } from '../application/asset-partner-agreement.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';

const router = Router();

// The operations panel manages Asset Partners with the same endpoints the admin console has always used.
router.use(assetPartnerApplicationAdminRoutes);
router.use(assetPartnerAdminRoutes);

router.get(
  '/asset-partner-agreements',
  authorize('admin:read'),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await assetPartnerAgreementService.versions());
  }),
);

/** Publishes a new version; partners who already signed keep the version they signed. */
router.post(
  '/asset-partner-agreements',
  authorize('host:manage'),
  validate({ body: z.object({ title: z.string().trim().min(3).max(160), body: z.string().trim().min(50).max(100_000) }) }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await assetPartnerAgreementService.publish(req.principal!.userId, req.body));
  }),
);

export const assetPartnerIocRoutes = router;
