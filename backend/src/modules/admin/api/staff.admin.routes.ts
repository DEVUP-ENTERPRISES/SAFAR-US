import { Router } from 'express';
import { z } from 'zod';
import { staffService, GRANTABLE_STAFF_ROLES } from '../application/staff.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';

/**
 * Staff accounts. authorize('*') is held only by super_admin, and there is one
 * of those, so only the main admin can create, change or lock other staff.
 */
const router = Router();
const role = z.enum(GRANTABLE_STAFF_ROLES);

router.get('/staff', authorize('*'), asyncHandler(async (_req, res) => sendSuccess(res, await staffService.list())));

router.post(
  '/staff',
  authorize('*'),
  validate({ body: z.object({ name: z.string().trim().min(2).max(80), role, email: z.string().email().max(160).optional() }) }),
  asyncHandler(async (req, res) => sendCreated(res, await staffService.create(req.body))),
);

router.post(
  '/staff/:id/role',
  authorize('*'),
  validate({ body: z.object({ role }) }),
  asyncHandler(async (req, res) => {
    await staffService.setRole(req.params.id, req.body.role);
    sendSuccess(res, { id: req.params.id, role: req.body.role });
  }),
);

router.post('/staff/:id/reset-password', authorize('*'), asyncHandler(async (req, res) => sendSuccess(res, await staffService.resetPassword(req.params.id))));

router.post(
  '/staff/:id/active',
  authorize('*'),
  validate({ body: z.object({ active: z.boolean() }) }),
  asyncHandler(async (req, res) => {
    await staffService.setActive(req.params.id, req.body.active, req.principal!.userId);
    sendSuccess(res, { id: req.params.id, active: req.body.active });
  }),
);

export const staffAdminRoutes = router;
