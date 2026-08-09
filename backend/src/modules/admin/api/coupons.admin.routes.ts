import { Router } from 'express';
import { z } from 'zod';
import { couponService } from '../../coupons/application/coupon.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';

/**
 * Promo-code management. Coupons previously had no admin surface at all — they
 * could only be inserted straight into the database — so marketing could not
 * run a campaign without a developer.
 *
 * Gated on `platform:manage` rather than plain `admin:read`: a coupon gives
 * away real money, so it sits with the other economic levers, out of reach of
 * every staff role that merely holds admin:read.
 */
const router = Router();

const bodySchema = z.object({
  code: z.string().min(3).max(32).regex(/^[A-Za-z0-9_-]+$/, 'Letters, numbers, dashes and underscores only'),
  campaign: z.string().max(120).optional(),
  type: z.enum(['percent', 'fixed']),
  valueBps: z.number().int().min(0).max(10000).optional(),
  amount: z.number().int().min(0).optional(),
  currency: z.string().length(3).optional(),
  minSpend: z.number().int().min(0).optional(),
  maxDiscount: z.number().int().min(0).optional(),
  budget: z.number().int().min(0).optional(),
  maxRedemptions: z.number().int().min(1).optional(),
  perUserLimit: z.number().int().min(0).optional(),
  firstTimeOnly: z.boolean().optional(),
  minTripDays: z.number().int().min(0).max(365).optional(),
  cities: z.array(z.string().max(80)).max(50).optional(),
  categories: z.array(z.string().max(40)).max(20).optional(),
  validFrom: z.coerce.date().optional(),
  validTo: z.coerce.date(),
  status: z.enum(['active', 'disabled']).optional(),
});

router.get(
  '/coupons',
  authorize('platform:manage'),
  asyncHandler(async (req, res) => {
    const result = await couponService.adminList({
      status: req.query.status as string,
      q: req.query.q as string,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      skip: req.query.skip ? Number(req.query.skip) : undefined,
    });
    sendSuccess(res, result.items, 200, { total: result.total });
  }),
);

router.post(
  '/coupons',
  authorize('platform:manage'),
  validate({ body: bodySchema }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await couponService.create(req.body));
  }),
);

router.get(
  '/coupons/:id',
  authorize('platform:manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await couponService.getById(req.params.id));
  }),
);

/** Campaign performance — redemptions, spend, budget burn, recent activity. */
router.get(
  '/coupons/:id/stats',
  authorize('platform:manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await couponService.stats(req.params.id));
  }),
);

router.patch(
  '/coupons/:id',
  authorize('platform:manage'),
  validate({ body: bodySchema.partial().omit({ code: true }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await couponService.update(req.params.id, req.body));
  }),
);

/** Pause or resume — the fast lever when a promo is being abused. */
router.post(
  '/coupons/:id/status',
  authorize('platform:manage'),
  validate({ body: z.object({ status: z.enum(['active', 'disabled']) }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await couponService.setStatus(req.params.id, req.body.status));
  }),
);

router.delete(
  '/coupons/:id',
  authorize('platform:manage'),
  asyncHandler(async (req, res) => {
    await couponService.remove(req.params.id);
    sendSuccess(res, { deleted: true });
  }),
);

export const couponsAdminRoutes = router;
