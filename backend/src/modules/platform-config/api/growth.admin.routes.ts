import { Router } from 'express';
import { z } from 'zod';
import { surgeService } from '../../pricing/application/surge.service';
import { subscriptionService } from '../../subscriptions/application/subscription.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

// ── Surge rules ───────────────────────────────────────────────────────

router.get(
  '/surge-rules',
  authorize('admin:read'),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await surgeService.listRules());
  }),
);

const surgeBody = z.object({
  name: z.string().min(2).max(80),
  scope: z.enum(['global', 'city', 'category', 'cityCategory']),
  city: z.string().optional(),
  category: z.string().optional(),
  multiplierBps: z.number().int().min(10000).max(50000),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
});

router.post(
  '/surge-rules',
  authorize('platform:manage'),
  validate({ body: surgeBody }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await surgeService.createRule(req.body, req.principal!.userId), 201);
  }),
);

router.put(
  '/surge-rules/:id',
  authorize('platform:manage'),
  validate({ body: surgeBody.partial().extend({ active: z.boolean().optional() }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await surgeService.updateRule(req.params.id, req.body));
  }),
);

router.delete(
  '/surge-rules/:id',
  authorize('platform:manage'),
  asyncHandler(async (req, res) => {
    await surgeService.deleteRule(req.params.id);
    sendSuccess(res, { deleted: true });
  }),
);

/** Live demand read-out: how full is a city on a given day, really? */
router.get(
  '/surge/occupancy',
  authorize('admin:read'),
  validate({ query: z.object({ city: z.string().min(1), day: z.coerce.date().optional() }) }),
  asyncHandler(async (req, res) => {
    const day = (req.query.day as unknown as Date) ?? new Date();
    const city = req.query.city as string;
    const occupancy = await surgeService.occupancyFor(city, day);
    const resolved = await surgeService.resolve({ city, day });
    sendSuccess(res, { city, day, occupancyPct: occupancy, ...resolved });
  }),
);

// ── Subscription plans (CATO Plus) ────────────────────────────────────

router.get(
  '/subscription-plans',
  authorize('admin:read'),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await subscriptionService.listPlans());
  }),
);

router.put(
  '/subscription-plans/:code',
  authorize('platform:manage'),
  validate({
    body: z.object({
      name: z.string().min(2).max(60).optional(),
      description: z.string().max(200).optional(),
      priceCents: z.number().int().min(0).optional(),
      active: z.boolean().optional(),
      benefits: z
        .object({
          bookingDiscountBps: z.number().int().min(0).max(5000).optional(),
          waiveSurge: z.boolean().optional(),
          freeProtectionCode: z.string().optional(),
          rewardsMultiplierBps: z.number().int().min(10000).max(50000).optional(),
        })
        .optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await subscriptionService.upsertPlan(req.params.code, req.body));
  }),
);

router.delete(
  '/subscription-plans/:code',
  authorize('platform:manage'),
  asyncHandler(async (req, res) => {
    await subscriptionService.deletePlan(req.params.code);
    sendSuccess(res, { deleted: true });
  }),
);

/** Membership MRR / member counts. */
router.get(
  '/subscription-stats',
  authorize('admin:read'),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await subscriptionService.stats());
  }),
);

export const growthAdminRoutes = router;
