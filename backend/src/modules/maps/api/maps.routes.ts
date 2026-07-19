import { Router } from 'express';
import { z } from 'zod';
import { mapsProvider } from '../infrastructure/maps.provider';
import { kv } from '../../../infrastructure/cache/kv-store';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

/** Cache map lookups aggressively — they're repetitive and cost money. */
async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = await kv().get(key);
  if (hit) return JSON.parse(hit) as T;
  const value = await fn();
  await kv().set(key, JSON.stringify(value), ttl);
  return value;
}

router.get(
  '/geocode',
  validate({ query: z.object({ q: z.string().min(1) }) }),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q);
    sendSuccess(res, await cached(`geo:${q.toLowerCase()}`, 86_400, () => mapsProvider.geocode(q)));
  }),
);

router.get(
  '/reverse',
  validate({ query: z.object({ lat: z.coerce.number(), lng: z.coerce.number() }) }),
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    sendSuccess(res, await cached(`rev:${lat},${lng}`, 86_400, () => mapsProvider.reverseGeocode(lat, lng)));
  }),
);

router.get(
  '/autocomplete',
  validate({ query: z.object({ q: z.string().min(1) }) }),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q);
    sendSuccess(res, await cached(`ac:${q.toLowerCase()}`, 3_600, () => mapsProvider.autocomplete(q)));
  }),
);

export const mapsRoutes = router;
