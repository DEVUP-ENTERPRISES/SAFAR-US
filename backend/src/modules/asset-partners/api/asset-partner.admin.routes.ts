import { Router } from 'express';
import { z } from 'zod';
import { assetPartnerService } from '../application/asset-partner.service';
import { assetPartnerStatementService } from '../application/asset-partner-statement.service';
import { assetPartnerMaintenanceService } from '../application/asset-partner-maintenance.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';

const router = Router();

/**
 * Asset Partner programme administration — deliberately its own surface, not
 * a filter on the hosts list. A partner has a lifecycle and commercial terms
 * a host does not, and ops needs to act on both.
 */

/**
 * Add a partner directly, without an application.
 *
 * The intake form is for strangers. These are owners the business already has
 * a signed agreement with — the fleet that predates the website — and making
 * ops fill in a prospect questionnaire on their behalf would invent answers
 * nobody gave.
 *
 * So this asks only for what ops genuinely knows: who they are, how to reach
 * them, and what kind of partner they are. Everything else — payout details,
 * mailing address, documents — is the partner's own to supply from their
 * portal once they sign in, which is both less work for ops and more accurate
 * than ops guessing.
 *
 * host:manage, not admin:read: this creates an account and grants programme
 * membership.
 */
router.post(
  '/asset-partners',
  authorize('host:manage'),
  validate({
    body: z.object({
      email: z.string().email(),
      fullName: z.string().min(2).max(120),
      businessName: z.string().max(120).optional(),
      phone: z.string().min(6).max(20).optional(),
      partnerType: z.enum(['individual', 'business', 'fleet']),
      /** Skip the sign-in email — for backfilling records quietly. */
      notify: z.boolean().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await assetPartnerService.addDirect(req.body, {
      notify: req.body.notify !== false,
    });
    sendCreated(res, result);
  }),
);

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
    // Terms resolved, plus their cars and any application — see adminDetail.
    sendSuccess(res, await assetPartnerService.adminDetail(req.params.id));
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

/**
 * Ops schedules maintenance on a partner-managed vehicle. Whether it needs the
 * partner's sign-off is computed from THEIR terms, not asked for here — see
 * assetPartnerMaintenanceService.create.
 */
router.post(
  '/asset-partners/maintenance',
  authorize('host:manage'),
  validate({
    body: z.object({
      vehicleId: z.string(),
      type: z.enum(['service', 'repair', 'inspection', 'cleaning']),
      scheduledFor: z.coerce.date(),
      costCents: z.number().int().min(0).optional(),
      odometerKm: z.number().int().min(0).optional(),
      notes: z.string().max(500).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await assetPartnerMaintenanceService.create(req.body));
  }),
);

export const assetPartnerAdminRoutes = router;
