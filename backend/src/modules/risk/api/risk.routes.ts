import { Router } from 'express';
import { z } from 'zod';
import { riskService, type DenyType } from '../application/risk.service';
import { trustScoreService } from '../application/trust-score.service';
import { userRepository } from '../../users/infrastructure/user.repository';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

/**
 * My trust score.
 *
 * Deliberately visible to the member, with its components and what to do next.
 * The RISK score is never exposed — it would be a tuning guide for anyone
 * trying to game it. Trust is the opposite: it only works if it is legible.
 */
router.get(
  '/trust/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const [score, perks] = await Promise.all([
      trustScoreService.compute(req.principal!.userId),
      trustScoreService.perks(req.principal!.userId),
    ]);
    sendSuccess(res, { ...score, perks });
  }),
);

// ── Operator surface ─────────────────────────────────────────────────

/** The review queue: everything the engine would not clear on its own. */
router.get(
  '/admin/risk/queue',
  authenticate,
  authorize('user:manage'),
  validate({
    query: z.object({
      band: z.enum(['low', 'medium', 'high', 'block']).optional(),
      limit: z.coerce.number().int().positive().max(200).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await riskService.queue({
      band: req.query.band as never,
      limit: req.query.limit as never,
    }));
  }),
);

/** Every risk decision for one account — the identity timeline. */
router.get(
  '/admin/risk/users/:userId',
  authenticate,
  authorize('user:manage'),
  asyncHandler(async (req, res) => {
    const [events, trust] = await Promise.all([
      riskService.historyFor(req.params.userId),
      trustScoreService.compute(req.params.userId),
    ]);
    sendSuccess(res, { events, trust });
  }),
);

/** A human disagrees with the engine. Always reason-gated, always audited. */
router.post(
  '/admin/risk/events/:eventId/override',
  authenticate,
  authorize('user:manage'),
  validate({
    body: z.object({
      action: z.enum(['allow', 'challenge', 'review', 'deny']),
      reason: z.string().min(10).max(500),
    }),
  }),
  asyncHandler(async (req, res) => {
    await riskService.override(
      req.params.eventId,
      req.principal!.userId,
      req.body.reason,
      req.body.action,
    );
    sendSuccess(res, { overridden: true });
  }),
);

/**
 * Move an account through its lifecycle.
 *
 * Separate from the generic user-status route because these transitions carry
 * consequences — `under_review` pauses booking without withdrawing access,
 * `closed` starts data minimisation — and each needs a recorded reason.
 */
router.post(
  '/admin/risk/users/:userId/status',
  authenticate,
  authorize('user:manage'),
  validate({
    body: z.object({
      status: z.enum(['active', 'restricted', 'under_review', 'suspended', 'banned', 'closed']),
      reason: z.string().min(5).max(500),
    }),
  }),
  asyncHandler(async (req, res) => {
    await userRepository.setStatus(req.params.userId, req.body.status, {
      reason: req.body.reason,
      by: req.principal!.userId,
    });
    sendSuccess(res, { status: req.body.status });
  }),
);

// ── Deny list ────────────────────────────────────────────────────────

const denyBody = z.object({
  type: z.enum(['email', 'phone', 'licence', 'device', 'card']),
  value: z.string().min(3).max(200),
  reason: z.string().min(10).max(500),
});

router.post(
  '/admin/risk/deny',
  authenticate,
  authorize('user:manage'),
  validate({ body: denyBody }),
  asyncHandler(async (req, res) => {
    await riskService.deny(
      req.body.type as DenyType,
      req.body.value,
      req.body.reason,
      req.principal!.userId,
    );
    sendSuccess(res, { denied: true });
  }),
);

router.post(
  '/admin/risk/allow',
  authenticate,
  authorize('user:manage'),
  validate({ body: denyBody.pick({ type: true, value: true }) }),
  asyncHandler(async (req, res) => {
    const removed = await riskService.allowAgain(req.body.type as DenyType, req.body.value);
    sendSuccess(res, { removed });
  }),
);

export const riskRoutes = router;
