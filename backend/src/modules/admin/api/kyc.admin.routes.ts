import { Router } from 'express';
import { z } from 'zod';
import { kycService } from '../../kyc/application/kyc.service';
import { verificationPolicyService } from '../../kyc/application/verification-policy.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

router.get(
  '/kyc',
  authorize('kyc:review'),
  asyncHandler(async (req, res) => {
    const result = await kycService.adminList({
      status: (req.query.status as string) ?? 'pending',
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      skip: req.query.skip ? Number(req.query.skip) : undefined,
    });
    sendSuccess(res, result.items, 200, { total: result.total });
  }),
);

router.post(
  '/kyc/:id/review',
  authorize('kyc:review'),
  validate({ body: z.object({ decision: z.enum(['approved', 'rejected']), reason: z.string().max(300).optional() }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await kycService.review(req.params.id, req.principal!.userId, req.body.decision, req.body.reason));
  }),
);

// ── Verification checks (MVR / identity / background) ─────────────────

/** A guest's standing across every check type — valid?, when it expires, how
 *  many ran in the current window, and the live policy for each. */
router.get(
  '/verification/:userId',
  authorize('kyc:review'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await verificationPolicyService.fullStatus(req.params.userId));
  }),
);

/** Whether a new check may run now (reuse-first, then the frequency cap). Lets
 *  ops see why a check would or would not fire before requesting one. */
router.get(
  '/verification/:userId/:type/can-run',
  authorize('kyc:review'),
  validate({ params: z.object({ userId: z.string(), type: z.enum(['identity', 'mvr', 'background', 'insurance']) }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await verificationPolicyService.canRun(req.params.userId, req.params.type as 'identity' | 'mvr' | 'background' | 'insurance'));
  }),
);

/** Record a completed check (used by the provider integration when it lands,
 *  and for a manual/ops override). validUntil is derived from config. */
router.post(
  '/verification/:userId/:type',
  authorize('kyc:review'),
  validate({
    params: z.object({ userId: z.string(), type: z.enum(['identity', 'mvr', 'background', 'insurance']) }),
    body: z.object({
      result: z.enum(['pending', 'passed', 'failed', 'error']),
      provider: z.string().max(40).optional(),
      reference: z.string().max(120).optional(),
      riskScore: z.number().optional(),
      notes: z.string().max(300).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await verificationPolicyService.record(req.params.userId, req.params.type as 'identity' | 'mvr' | 'background' | 'insurance', req.body),
      201,
    );
  }),
);

export const kycAdminRoutes = router;
