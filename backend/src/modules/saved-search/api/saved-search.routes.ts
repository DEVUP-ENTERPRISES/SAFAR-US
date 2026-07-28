import { Router } from 'express';
import { z } from 'zod';
import { savedSearchService } from '../application/saved-search.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';

const router = Router();

const createSchema = z.object({
  label: z.string().max(120).optional(),
  city: z.string().max(80).optional(),
  category: z.string().max(40).optional(),
  fuelType: z.enum(['petrol', 'diesel', 'hybrid', 'ev']).optional(),
  transmission: z.enum(['manual', 'automatic']).optional(),
  seatsMin: z.number().int().min(1).max(20).optional(),
  priceMaxCents: z.number().int().positive().optional(),
  instantBook: z.boolean().optional(),
});

router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await savedSearchService.list(req.principal!.userId));
  }),
);

router.post(
  '/',
  authenticate,
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await savedSearchService.create(req.principal!.userId, req.body));
  }),
);

router.patch(
  '/:id/alerts',
  authenticate,
  validate({ body: z.object({ enabled: z.boolean() }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await savedSearchService.setAlerts(req.principal!.userId, req.params.id, req.body.enabled));
  }),
);

router.delete(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await savedSearchService.remove(req.principal!.userId, req.params.id));
  }),
);

export const savedSearchRoutes = router;
