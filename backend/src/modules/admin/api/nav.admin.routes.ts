import { Router } from 'express';
import { navForPermissions } from '../admin.nav';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

/**
 * Returns the admin sidebar the current principal may access — grouped
 * {slug, path, apiPath, label, group}. The web panel renders from this, so
 * permissions and navigation stay in lock-step with one backend source.
 */
router.get(
  '/nav',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, navForPermissions(req.principal!.permissions));
  }),
);

export const navAdminRoutes = router;
