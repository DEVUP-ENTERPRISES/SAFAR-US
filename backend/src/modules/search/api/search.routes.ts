import { Router } from 'express';
import { z } from 'zod';
import { searchService } from '../application/search.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { validate } from '../../../shared/middleware/validate';
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

export const searchRoutes = router;
