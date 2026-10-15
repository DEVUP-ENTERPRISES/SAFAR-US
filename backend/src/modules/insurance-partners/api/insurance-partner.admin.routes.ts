import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';
import { insurancePartnerService } from '../application/insurance-partner.service';
import { insurerLedgerService } from '../application/insurer-ledger.service';
import { insurancePlanService } from '../application/insurance-plan.service';
import { InsurancePlanModel } from '../infrastructure/insurance-plan.model';

const router = Router();

router.get(
  '/insurance-partners',
  authorize('admin:read'),
  validate({
    query: z.object({
      status: z.enum(['pending', 'approved', 'rejected', 'suspended']).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
      skip: z.coerce.number().int().min(0).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await insurancePartnerService.adminList(req.query as never);
    sendSuccess(res, result.items, 200, { total: result.total });
  }),
);

/** One insurer with its plans, money and default commission. */
router.get(
  '/insurance-partners/:id',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    const insurer = await insurancePartnerService.adminOne(req.params.id);
    const [plans, summary, payouts, commissionBps] = await Promise.all([
      InsurancePlanModel.find({ insurerId: insurer._id }).sort({ sortOrder: 1 }).lean().exec(),
      insurerLedgerService.summary(insurer._id),
      insurerLedgerService.payouts(insurer._id),
      insurancePartnerService.commissionBps(insurer),
    ]);
    sendSuccess(res, { insurer, plans, summary, payouts, commissionBps });
  }),
);

router.post(
  '/insurance-partners/:id/review',
  authorize('host:manage'),
  validate({ body: z.object({ decision: z.enum(['approved', 'rejected']), notes: z.string().trim().max(1000).optional() }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await insurancePartnerService.review(req.params.id, req.principal!.userId, req.body.decision, req.body.notes));
  }),
);

router.post(
  '/insurance-partners/:id/plans/:planId/review',
  authorize('host:manage'),
  validate({ body: z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().trim().max(1000).optional() }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await insurancePlanService.review(req.params.id, req.params.planId, req.body.decision, req.body.note));
  }),
);

router.post(
  '/insurance-partners/:id/status',
  authorize('host:manage'),
  validate({ body: z.object({ status: z.enum(['approved', 'suspended']), reason: z.string().trim().max(500).optional() }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await insurancePartnerService.setStatus(req.params.id, req.body.status, req.body.reason));
  }),
);

/** A negotiated commission in basis points, or null for the platform default. */
router.patch(
  '/insurance-partners/:id/commission',
  authorize('platform:manage'),
  validate({ body: z.object({ commissionBps: z.number().int().min(0).max(5000).nullable() }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await insurancePartnerService.setCommission(req.params.id, req.body.commissionBps));
  }),
);

/** Record money sent to the insurer against what it is owed. */
router.post(
  '/insurance-partners/:id/payouts',
  authorize('payout:manage'),
  validate({
    body: z.object({
      amount: z.number().int().min(1),
      reference: z.string().trim().min(2).max(120),
      note: z.string().trim().max(500).optional(),
      paidAt: z.coerce.date().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    await insurancePartnerService.adminOne(req.params.id);
    sendSuccess(res, await insurerLedgerService.recordPayout(req.params.id, req.principal!.userId, req.body));
  }),
);

export const insurancePartnerAdminRoutes = router;
