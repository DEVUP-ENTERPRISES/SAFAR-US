import { Router } from 'express';
import { z } from 'zod';
import { reviewService } from '../application/review.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';

const router = Router();

const createSchema = z.object({
  bookingId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).default(''),
});

router.post(
  '/',
  authenticate,
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const r = await reviewService.create(
      req.principal!.userId,
      req.body.bookingId,
      req.body.rating,
      req.body.comment,
    );
    sendCreated(res, r);
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const subjectId = req.query.subjectId as string;
    sendSuccess(res, await reviewService.listForSubject(subjectId));
  }),
);

/** Star-rating breakdown for a subject — powers the reviews histogram. */
router.get(
  '/distribution',
  asyncHandler(async (req, res) => {
    sendSuccess(res, await reviewService.distribution(req.query.subjectId as string));
  }),
);

/** Reviews on one booking — drives the "leave a review" prompt for each party. */
router.get(
  '/booking/:bookingId',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await reviewService.listForBooking(req.params.bookingId, req.principal!.userId));
  }),
);

export const reviewsRoutes = router;
