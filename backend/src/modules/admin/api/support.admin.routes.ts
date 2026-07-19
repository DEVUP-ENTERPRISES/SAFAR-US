import { Router } from 'express';
import { z } from 'zod';
import { ticketService } from '../../support/application/ticket.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

router.get(
  '/tickets',
  authorize('ticket:manage'),
  asyncHandler(async (req, res) => {
    const result = await ticketService.adminList({
      status: req.query.status as string,
      priority: req.query.priority as string,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      skip: req.query.skip ? Number(req.query.skip) : undefined,
    });
    sendSuccess(res, result.items, 200, { total: result.total });
  }),
);

/** SLA health for the open queue — what's breached, what's about to. */
router.get(
  '/tickets/sla',
  authorize('ticket:manage'),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await ticketService.slaStats());
  }),
);

router.get(
  '/tickets/:id',
  authorize('ticket:manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await ticketService.get(req.principal!.userId, req.params.id, true));
  }),
);

router.post(
  '/tickets/:id/reply',
  authorize('ticket:manage'),
  validate({ body: z.object({ body: z.string().min(1).max(2000), internal: z.boolean().optional() }) }),
  asyncHandler(async (req, res) => {
    const t = await ticketService.reply(req.principal!.userId, req.params.id, req.body.body, {
      isAgent: true,
      internal: req.body.internal,
    });
    sendSuccess(res, t);
  }),
);

router.post(
  '/tickets/:id/assign',
  authorize('ticket:manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await ticketService.assign(req.params.id, req.principal!.userId));
  }),
);

router.post(
  '/tickets/:id/escalate',
  authorize('ticket:manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await ticketService.escalate(req.params.id));
  }),
);

router.post(
  '/tickets/:id/resolve',
  authorize('ticket:manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await ticketService.resolve(req.params.id));
  }),
);

export const supportAdminRoutes = router;