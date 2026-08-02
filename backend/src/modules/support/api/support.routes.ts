import { Router } from 'express';
import { z } from 'zod';
import { ticketService } from '../application/ticket.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';

const router = Router();

const createSchema = z.object({
  subject: z.string().min(3).max(160),
  category: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  body: z.string().min(3).max(2000),
  relatedType: z.string().optional(),
  relatedId: z.string().optional(),
});

router.post(
  '/tickets',
  authenticate,
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await ticketService.create(req.principal!.userId, req.body));
  }),
);

router.get(
  '/tickets',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await ticketService.listForUser(req.principal!.userId));
  }),
);

router.get(
  '/tickets/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await ticketService.get(req.principal!.userId, req.params.id, false));
  }),
);

router.post(
  '/tickets/:id/messages',
  authenticate,
  validate({ body: z.object({ body: z.string().min(1).max(2000) }) }),
  asyncHandler(async (req, res) => {
    const t = await ticketService.reply(req.principal!.userId, req.params.id, req.body.body, { isAgent: false });
    sendSuccess(res, t);
  }),
);

/** Requester rates support after their ticket is resolved (CSAT). */
router.post(
  '/tickets/:id/csat',
  authenticate,
  validate({ body: z.object({ rating: z.number().int().min(1).max(5) }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await ticketService.rateCsat(req.principal!.userId, req.params.id, req.body.rating));
  }),
);

export const supportRoutes = router;
