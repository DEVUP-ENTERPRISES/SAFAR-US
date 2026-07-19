import { Router } from 'express';
import { z } from 'zod';
import { featureFlagService } from '../../feature-flags/application/feature-flag.service';
import { auditService } from '../../audit/application/audit.service';
import { financeReportService } from '../application/finance-report.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

// ── Feature flags ─────────────────────────────────────────────────────
router.get(
  '/feature-flags',
  authorize('admin:read'),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await featureFlagService.list());
  }),
);

router.put(
  '/feature-flags/:key',
  // Write guard, not admin:read — that permission is held by support/moderator/
  // finance/ops, and none of them should be able to flip platform-wide flags.
  authorize('platform:manage'),
  validate({
    body: z.object({
      description: z.string().optional(),
      enabled: z.boolean().optional(),
      rollout: z
        .object({
          percentage: z.number().min(0).max(100).optional(),
          allowUserIds: z.array(z.string()).optional(),
          allowRoles: z.array(z.string()).optional(),
        })
        .optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const flag = await featureFlagService.upsert(req.params.key, req.body, req.principal!.userId);
    sendSuccess(res, flag);
  }),
);

// ── Finance report ────────────────────────────────────────────────────
router.get(
  '/finance',
  authorize('analytics:read'),
  asyncHandler(async (req, res) => {
    const months = req.query.months ? Math.min(24, Math.max(1, Number(req.query.months))) : 6;
    sendSuccess(res, await financeReportService.report(months));
  }),
);

// ── Audit logs ────────────────────────────────────────────────────────
router.get(
  '/audit-logs',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    const result = await auditService.query({
      actorId: req.query.actorId as string,
      action: req.query.action as string,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      skip: req.query.skip ? Number(req.query.skip) : undefined,
    });
    sendSuccess(res, result.items, 200, { total: result.total });
  }),
);

export const platformAdminRoutes = router;
