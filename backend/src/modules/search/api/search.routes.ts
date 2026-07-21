import { Router } from 'express';
import { z } from 'zod';
import { searchService } from '../application/search.service';
import { facetsService } from '../application/facets.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { validate } from '../../../shared/middleware/validate';
import { authenticate } from '../../../shared/middleware/authenticate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

const searchSchema = z.object({
  lng: z.coerce.number().min(-180).max(180),
  lat: z.coerce.number().min(-90).max(90),
  radiusKm: z.coerce.number().positive().max(500).optional(),
  make: z.string().optional(),
  bodyType: z.string().optional(),
  category: z.string().optional(),
  fuelType: z.enum(['petrol', 'diesel', 'hybrid', 'ev']).optional(),
  transmission: z.enum(['manual', 'automatic']).optional(),
  seatsMin: z.coerce.number().int().positive().optional(),
  priceMin: z.coerce.number().int().positive().optional(),
  priceMax: z.coerce.number().int().positive().optional(),
  instantBook: z.coerce.boolean().optional(),
  delivery: z.coerce.boolean().optional(),
  ratingMin: z.coerce.number().min(0).max(5).optional(),
  features: z.string().optional(),
  start: z.coerce.date().optional(),
  end: z.coerce.date().optional(),
  sort: z.enum(['relevance', 'price_asc', 'price_desc', 'rating', 'trending', 'newest']).optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

router.get(
  '/vehicles',
  validate({ query: searchSchema }),
  asyncHandler(async (req, res) => {
    const results = await searchService.searchVehicles(req.query as never);
    sendSuccess(res, results, 200, { count: results.length });
  }),
);

/** "For You" — personalized picks from the signed-in user's booking history. */
router.get(
  '/recommendations',
  authenticate,
  validate({ query: z.object({ limit: z.coerce.number().int().positive().max(30).optional() }) }),
  asyncHandler(async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 12;
    const results = await searchService.recommendFor(req.principal!.userId, limit);
    sendSuccess(res, results, 200, { count: results.length });
  }),
);

/**
 * Public marketplace facets — the real cities, categories and trust numbers.
 * Public and hit on every homepage load, so it carries a short cache header;
 * supply moves on the order of minutes, not seconds.
 */
router.get(
  '/facets',
  validate({ query: z.object({ city: z.string().max(80).optional() }) }),
  asyncHandler(async (req, res) => {
    const facets = await facetsService.marketplace(req.query.city as string | undefined);
    res.set('Cache-Control', 'public, max-age=60');
    sendSuccess(res, facets);
  }),
);

export const searchRoutes = router;
