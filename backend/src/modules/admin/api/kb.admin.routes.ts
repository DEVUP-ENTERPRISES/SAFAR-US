import { Router } from 'express';
import { z } from 'zod';
import { kbService } from '../../support/application/kb.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';

/**
 * Knowledge-base authoring — support staff (ticket:manage) draft, publish, and
 * curate help articles. Deflecting a ticket with a good article is cheaper than
 * answering it; the stats endpoint surfaces which articles need a rewrite.
 */
const router = Router();

const bodySchema = z.object({
  title: z.string().min(3).max(160),
  summary: z.string().max(300).optional(),
  body: z.string().min(10),
  category: z.string().max(60).optional(),
  tags: z.array(z.string().max(40)).max(15).optional(),
  status: z.enum(['draft', 'published']).optional(),
});

router.get(
  '/kb/articles',
  authorize('ticket:manage'),
  asyncHandler(async (req, res) => {
    const result = await kbService.adminList({
      status: req.query.status as string,
      category: req.query.category as string,
      q: req.query.q as string,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      skip: req.query.skip ? Number(req.query.skip) : undefined,
    });
    sendSuccess(res, result.items, 200, { total: result.total });
  }),
);

/** KB health — live vs draft, total reads, and articles voted least helpful. */
router.get(
  '/kb/stats',
  authorize('ticket:manage'),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await kbService.stats());
  }),
);

router.post(
  '/kb/articles',
  authorize('ticket:manage'),
  validate({ body: bodySchema }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await kbService.create(req.principal!.userId, req.body));
  }),
);

router.get(
  '/kb/articles/:id',
  authorize('ticket:manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await kbService.getById(req.params.id));
  }),
);

router.patch(
  '/kb/articles/:id',
  authorize('ticket:manage'),
  validate({ body: bodySchema.partial().omit({ status: true }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await kbService.update(req.params.id, req.body));
  }),
);

router.post(
  '/kb/articles/:id/publish',
  authorize('ticket:manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await kbService.publish(req.params.id));
  }),
);

router.post(
  '/kb/articles/:id/unpublish',
  authorize('ticket:manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await kbService.unpublish(req.params.id));
  }),
);

router.delete(
  '/kb/articles/:id',
  authorize('ticket:manage'),
  asyncHandler(async (req, res) => {
    await kbService.remove(req.params.id);
    sendSuccess(res, { deleted: true });
  }),
);

export const kbAdminRoutes = router;
