import { Router } from 'express';
import { z } from 'zod';
import { dataRightsService } from '../application/data-rights.service';
import { auditService } from '../../audit/application/audit.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { auditLog } from '../../../shared/middleware/audit-log';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

/**
 * These routes live outside the /admin router, so they do not inherit its
 * audit middleware — every privileged action here would otherwise be
 * completely unlogged. Applied explicitly rather than moved, because the
 * member-facing routes in this file must stay reachable without admin scope.
 */
router.use(auditLog('compliance'));

/**
 * "Download my data" — the subject access request, self-service.
 *
 * Deliberately not a support ticket. A right that requires asking a human is a
 * right with a queue in front of it, and both CCPA and PIPEDA put a clock on
 * the response. Self-service also removes the staff access that a manual
 * process would otherwise require.
 */
router.get(
  '/me/data-export',
  authenticate,
  asyncHandler(async (req, res) => {
    const data = await dataRightsService.exportFor(req.principal!.userId);

    // A subject access request is itself an event worth recording — it proves
    // the request was answered, and when.
    void auditService.record({
      actorId: req.principal!.userId,
      actorRoles: req.principal!.roles,
      action: 'GET /me/data-export',
      resourceType: 'user',
      resourceId: req.principal!.userId,
      ip: req.ip,
      status: 200,
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="tura-data-${req.principal!.userId}.json"`,
    );
    res.send(JSON.stringify(data, null, 2));
  }),
);

/** What, if anything, stands in the way of closing this account. */
router.get(
  '/me/erasure-eligibility',
  authenticate,
  asyncHandler(async (req, res) => {
    const blockers = await dataRightsService.erasureBlockers(req.principal!.userId);
    sendSuccess(res, { eligible: blockers.length === 0, blockers });
  }),
);

/**
 * Erase my account.
 *
 * Requires the password again: this is irreversible, and a hijacked session
 * must not be able to destroy someone's account and its evidence trail.
 */
router.post(
  '/me/erase',
  authenticate,
  validate({
    body: z.object({
      confirm: z.literal('DELETE MY ACCOUNT'),
      reason: z.string().max(500).default('Requested by the account holder'),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await dataRightsService.erase(
      req.principal!.userId,
      req.principal!.userId,
      req.body.reason,
    );
    sendSuccess(res, result);
  }),
);

// ── Operator surface ─────────────────────────────────────────────────

router.get(
  '/admin/compliance/users/:userId/export',
  authenticate,
  authorize('user:manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await dataRightsService.exportFor(req.params.userId));
  }),
);

/** Erasure on someone's behalf — a request that arrived by post or by phone. */
router.post(
  '/admin/compliance/users/:userId/erase',
  authenticate,
  authorize('user:manage'),
  validate({
    body: z.object({
      confirm: z.literal('ERASE'),
      reason: z.string().min(10).max(500),
    }),
  }),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await dataRightsService.erase(req.params.userId, req.principal!.userId, req.body.reason),
    );
  }),
);

router.post(
  '/admin/compliance/users/:userId/legal-hold',
  authenticate,
  authorize('user:manage'),
  validate({ body: z.object({ reason: z.string().min(10).max(500) }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await dataRightsService.placeHold(req.params.userId, req.body.reason, req.principal!.userId),
    );
  }),
);

router.delete(
  '/admin/compliance/users/:userId/legal-hold',
  authenticate,
  authorize('user:manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await dataRightsService.releaseHold(req.params.userId, req.principal!.userId));
  }),
);

/** Everything ever done to one record, for an investigation or a subpoena. */
router.get(
  '/admin/compliance/audit/:resourceType/:resourceId',
  authenticate,
  authorize('user:manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await auditService.forResource(req.params.resourceType, req.params.resourceId),
    );
  }),
);

export const complianceRoutes = router;
