import { Router } from 'express';
import { z } from 'zod';
import { taxService } from '../../tax/application/tax.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';

/**
 * Rental tax rules. Gated on `platform:manage` — a wrong rate here is a
 * liability on every booking, not a display bug, so it sits with the other
 * levers that move money rather than with plain admin:read.
 */
const router = Router();

const body = z.object({
  label: z.string().min(3).max(120),
  scope: z.enum(['country', 'state', 'city', 'airport']),
  matchValue: z.string().min(1).max(40),
  kind: z.enum(['sales_tax', 'rental_excise', 'airport_concession', 'surcharge']).optional(),
  rateBps: z.number().int().min(0).max(10000).optional(),
  perDayCents: z.number().int().min(0).optional(),
  perTripCents: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().optional(),
  note: z.string().max(500).optional(),
});

router.get(
  '/tax-rules',
  authorize('platform:manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await taxService.list({
        scope: req.query.scope as string,
        active: req.query.active === undefined ? undefined : req.query.active === 'true',
      }),
    );
  }),
);

router.post(
  '/tax-rules',
  authorize('platform:manage'),
  validate({ body }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await taxService.create(req.body));
  }),
);

router.patch(
  '/tax-rules/:id',
  authorize('platform:manage'),
  validate({ body: body.partial() }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await taxService.update(req.params.id, req.body));
  }),
);

router.delete(
  '/tax-rules/:id',
  authorize('platform:manage'),
  asyncHandler(async (req, res) => {
    await taxService.remove(req.params.id);
    sendSuccess(res, { deleted: true });
  }),
);

/**
 * What a given place would be taxed, without making a booking. Lets finance
 * check a jurisdiction's stack before a guest ever sees it.
 */
router.get(
  '/tax-rules/preview',
  authorize('platform:manage'),
  asyncHandler(async (req, res) => {
    const amount = Number(req.query.amount ?? 10000);
    sendSuccess(
      res,
      await taxService.quote(
        { amount, currency: 'USD' },
        {
          state: req.query.state as string,
          city: req.query.city as string,
          airportCode: req.query.airport as string,
          days: Number(req.query.days ?? 1),
        },
      ),
    );
  }),
);

export const taxAdminRoutes = router;
