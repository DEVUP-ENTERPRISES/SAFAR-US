import { Router } from 'express';
import { z } from 'zod';
import { assetPartnerService } from '../application/asset-partner.service';
import { assetPartnerStatementService } from '../application/asset-partner-statement.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

/**
 * Asset Partner programme administration — deliberately its own surface, not
 * a filter on the hosts list. A partner has a lifecycle and commercial terms
 * a host does not, and ops needs to act on both.
 */

router.get(
  '/asset-partners',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    const result = await assetPartnerService.adminList({
      status: req.query.status as never,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      skip: req.query.skip ? Number(req.query.skip) : undefined,
    });
    sendSuccess(res, result.items, 200, { total: result.total });
  }),
);

router.get(
  '/asset-partners/:id',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    const partner = await assetPartnerService.getById(req.params.id);
    // The terms actually in force, resolved — so ops sees the same numbers the
    // partner's own statement is built from rather than just the overrides.
    const terms = await assetPartnerService.termsFor(partner);
    sendSuccess(res, { partner, terms });
  }),
);

/** One month's statement, as the partner sees it. For support and disputes. */
router.get(
  '/asset-partners/:id/statement',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    const partner = await assetPartnerService.getById(req.params.id);
    const period = typeof req.query.period === 'string' ? req.query.period : undefined;
    sendSuccess(res, await assetPartnerStatementService.statement(partner, period));
  }),
);

router.post(
  '/asset-partners/:id/status',
  authorize('host:manage'),
  validate({
    body: z.object({
      status: z.enum(['onboarding', 'active', 'suspended', 'exited']),
      reason: z.string().max(300).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await assetPartnerService.transition(req.params.id, req.body.status, {
        reason: req.body.reason,
      }),
    );
  }),
);

/**
 * Negotiate terms for one partner. Every field is optional — an unset field
 * falls back to the platform default, so a fleet deal only states what is
 * actually different.
 */
router.patch(
  '/asset-partners/:id/terms',
  authorize('host:manage'),
  validate({
    body: z.object({
      managementFeeBps: z.number().int().min(0).max(10_000).optional(),
      insuranceMonthlyCents: z.number().int().min(0).optional(),
      detailingMonthlyCents: z.number().int().min(0).optional(),
      deductibleCapCents: z.number().int().min(0).optional(),
      maintenanceApprovalCents: z.number().int().min(0).optional(),
      payoutMethod: z.enum(['check', 'zelle']).optional(),
      payoutDayOfMonth: z.number().int().min(1).max(28).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await assetPartnerService.setTerms(req.params.id, req.body));
  }),
);

export const assetPartnerAdminRoutes = router;
