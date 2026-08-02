import { Router } from 'express';
import { z } from 'zod';
import { kbService } from '../application/kb.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

/**
 * Public help centre — browse, search, and read self-serve articles, and vote
 * on whether they helped. No auth: help should be readable while logged out
 * (or before a guest has an account). Authoring lives in the admin console.
 */
const router = Router();

router.get(
  '/articles',
  asyncHandler(async (req, res) => {
    const items = await kbService.listPublished({
      q: req.query.q as string,
      category: req.query.category as string,
      tag: req.query.tag as string,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    sendSuccess(res, items);
  }),
);

router.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await kbService.categories());
  }),
);

router.get(
  '/articles/:slug',
  asyncHandler(async (req, res) => {
    sendSuccess(res, await kbService.getBySlug(req.params.slug));
  }),
);

router.post(
  '/articles/:slug/vote',
  validate({ body: z.object({ helpful: z.boolean() }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await kbService.vote(req.params.slug, req.body.helpful));
  }),
);

export const kbRoutes = router;
