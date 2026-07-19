import { Router } from 'express';
import { z } from 'zod';
import { corporateService } from '../application/corporate.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';

const router = Router();
router.use(authenticate);

// ── Org ──────────────────────────────────────────────────────────────
router.post(
  '/orgs',
  validate({ body: z.object({ name: z.string().min(2), billingEmail: z.string().email(), domain: z.string().optional() }) }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await corporateService.createOrg(req.principal!.userId, req.body.name, req.body.billingEmail, req.body.domain));
  }),
);

router.get('/me', asyncHandler(async (req, res) => {
  sendSuccess(res, await corporateService.myOrg(req.principal!.userId));
}));

router.get('/dashboard', asyncHandler(async (req, res) => {
  sendSuccess(res, await corporateService.dashboard(req.principal!.userId));
}));

// ── Members ──────────────────────────────────────────────────────────
router.get('/members', asyncHandler(async (req, res) => {
  sendSuccess(res, await corporateService.listMembers(req.principal!.userId));
}));

router.post(
  '/members',
  validate({ body: z.object({ email: z.string().email(), role: z.enum(['corp_admin', 'manager', 'employee']).default('employee'), costCenterId: z.string().optional() }) }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await corporateService.inviteMember(req.principal!.userId, req.body.email, req.body.role, req.body.costCenterId));
  }),
);

router.delete('/members/:id', asyncHandler(async (req, res) => {
  await corporateService.removeMember(req.principal!.userId, req.params.id);
  sendSuccess(res, { removed: true });
}));

// ── Cost centers ─────────────────────────────────────────────────────
router.get('/cost-centers', asyncHandler(async (req, res) => {
  sendSuccess(res, await corporateService.listCostCenters(req.principal!.userId));
}));

router.post(
  '/cost-centers',
  validate({ body: z.object({ name: z.string().min(1), code: z.string().min(1), budget: z.number().int().min(0).default(0) }) }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await corporateService.createCostCenter(req.principal!.userId, req.body.name, req.body.code, req.body.budget));
  }),
);

// ── Travel policy ────────────────────────────────────────────────────
router.get('/policy', asyncHandler(async (req, res) => {
  sendSuccess(res, await corporateService.getPolicy(req.principal!.userId));
}));

router.put(
  '/policy',
  validate({
    body: z.object({
      maxDailyPrice: z.number().int().min(0).optional(),
      allowedCategories: z.array(z.string()).optional(),
      autoApproveUnder: z.number().int().min(0).optional(),
      requireApprovalOver: z.number().int().min(0).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await corporateService.setPolicy(req.principal!.userId, req.body));
  }),
);

// ── Trip requests / approvals ────────────────────────────────────────
router.get('/requests', asyncHandler(async (req, res) => {
  sendSuccess(res, await corporateService.listRequests(req.principal!.userId, req.query.status as string));
}));

router.post(
  '/requests',
  validate({ body: z.object({ vehicleId: z.string(), start: z.coerce.date(), end: z.coerce.date(), costCenterId: z.string().optional(), reason: z.string().max(300).optional() }) }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await corporateService.createRequest(req.principal!.userId, req.body));
  }),
);

router.post(
  '/requests/:id/decision',
  validate({ body: z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().max(300).optional() }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await corporateService.decideRequest(req.principal!.userId, req.params.id, req.body.decision, req.body.note));
  }),
);

router.post('/requests/:id/book', asyncHandler(async (req, res) => {
  sendSuccess(res, await corporateService.bookApproved(req.principal!.userId, req.params.id));
}));

// ── Consolidated invoice ─────────────────────────────────────────────
router.get('/invoice', asyncHandler(async (req, res) => {
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;
  sendSuccess(res, await corporateService.invoice(req.principal!.userId, from, to));
}));

export const corporateRoutes = router;
