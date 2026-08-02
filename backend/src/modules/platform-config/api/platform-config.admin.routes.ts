import { Router } from 'express';
import { z } from 'zod';
import { platformConfigService } from '../application/platform-config.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

const bps = z.number().int().min(0).max(10000);
const cents = z.number().int().min(0);

// ── Platform economics ────────────────────────────────────────────────

/** Read the live economics config (any staff may see it). */
router.get(
  '/config',
  authorize('admin:read'),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await platformConfigService.get());
  }),
);

/** Retune the marketplace. Money-affecting → platform:manage, not admin:read. */
router.put(
  '/config',
  authorize('platform:manage'),
  validate({
    body: z.object({
      deposit: z
        .object({
          enabled: z.boolean().optional(),
          minCents: cents.optional(),
          maxCents: cents.optional(),
          multiplierBps: z.number().int().min(0).max(100000).optional(),
          autoReleaseHours: z.number().int().min(0).max(720).optional(),
        })
        .optional(),
      commission: z.object({ defaultBps: bps.optional(), minBps: bps.optional(), maxBps: bps.optional() }).optional(),
      tax: z.object({ bps: bps.optional() }).optional(),
      pricing: z
        .object({
          earlyBirdMinDaysAhead: z.number().int().min(0).max(365).optional(),
          lastMinuteMaxHoursAhead: z.number().int().min(0).max(720).optional(),
        })
        .optional(),
      cancellation: z
        .object({
          flexible: z.object({ fullBeforeHours: z.number().int().min(0).max(2160), partialBps: bps }).optional(),
          moderate: z.object({ fullBeforeHours: z.number().int().min(0).max(2160), partialBps: bps }).optional(),
          strict: z.object({ fullBeforeHours: z.number().int().min(0).max(2160), partialBps: bps }).optional(),
        })
        .optional(),
      noShow: z
        .object({ graceHours: z.number().int().min(0).max(72).optional(), guestForfeitBps: bps.optional() })
        .optional(),
      superhost: z
        .object({
          minTrips: z.number().int().min(0).max(1000).optional(),
          minRatingAvg: z.number().min(0).max(5).optional(),
          minRatingCount: z.number().int().min(0).max(1000).optional(),
          maxCancellationRatePct: z.number().min(0).max(100).optional(),
        })
        .optional(),
      notifications: z
        .object({
          categoryChannels: z
            .record(
              z.enum(['trips', 'messages', 'payments', 'promotions', 'reviews', 'account']),
              z.object({ push: z.boolean(), email: z.boolean(), sms: z.boolean() }),
            )
            .optional(),
        })
        .optional(),
      wallet: z
        .object({
          maxBalanceCentsByTier: z
            .object({ new: cents.optional(), bronze: cents.optional(), silver: cents.optional(), gold: cents.optional() })
            .optional(),
        })
        .optional(),
      payoutTrust: z
        .object({
          newHostTripThreshold: z.number().int().min(0).max(100).optional(),
          newHostExtraHoldHours: z.number().int().min(0).max(720).optional(),
        })
        .optional(),
      incidentals: z
        .object({
          fuelPerPercentCents: cents.optional(),
          cleaningCents: cents.optional(),
          smokingCents: cents.optional(),
          petCents: cents.optional(),
          lateReturnPerHourCents: cents.optional(),
        })
        .optional(),
      surge: z
        .object({
          enabled: z.boolean().optional(),
          autoEnabled: z.boolean().optional(),
          maxMultiplierBps: z.number().int().min(10000).max(50000).optional(),
          occupancyThresholds: z
            .array(z.object({ occupancyPct: z.number().min(0).max(100), multiplierBps: z.number().int().min(10000).max(50000) }))
            .optional(),
        })
        .optional(),
      support: z
        .object({
          slaHours: z
            .object({
              urgent: z.number().int().min(0).optional(),
              high: z.number().int().min(0).optional(),
              normal: z.number().int().min(0).optional(),
              low: z.number().int().min(0).optional(),
            })
            .optional(),
        })
        .optional(),
      payout: z
        .object({
          holdHours: z.number().int().min(0).max(720).optional(),
          instantFeeBps: bps.optional(),
          instantFeeMinCents: cents.optional(),
        })
        .optional(),
      rewards: z
        .object({ pointValueCents: cents.optional(), pointsPerDollar: z.number().int().min(0).optional() })
        .optional(),
      referral: z
        .object({ referrerCreditCents: cents.optional(), refereeCreditCents: cents.optional() })
        .optional(),
      protection: z
        .array(
          z.object({
            code: z.string().min(1),
            label: z.string().min(1),
            description: z.string().default(''),
            pricePerDay: cents,
          }),
        )
        .optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await platformConfigService.update(req.body, req.principal!.userId));
  }),
);

// ── Commission rules ──────────────────────────────────────────────────

router.get(
  '/commission-rules',
  authorize('admin:read'),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await platformConfigService.listRules());
  }),
);

const ruleBody = z.object({
  name: z.string().min(2).max(80),
  scope: z.enum(['global', 'category', 'hostTier', 'host']),
  scopeValue: z.string().optional(),
  commissionBps: bps,
  priority: z.number().int().min(0).max(1000).optional(),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().optional(),
});

router.post(
  '/commission-rules',
  authorize('platform:manage'),
  validate({ body: ruleBody }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await platformConfigService.createRule(req.body, req.principal!.userId), 201);
  }),
);

router.put(
  '/commission-rules/:id',
  authorize('platform:manage'),
  validate({ body: ruleBody.partial().extend({ active: z.boolean().optional() }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await platformConfigService.updateRule(req.params.id, req.body, req.principal!.userId));
  }),
);

router.delete(
  '/commission-rules/:id',
  authorize('platform:manage'),
  asyncHandler(async (req, res) => {
    await platformConfigService.deleteRule(req.params.id);
    sendSuccess(res, { deleted: true });
  }),
);

/**
 * Dry-run the rule engine: "what rate would a luxury car from this superhost
 * actually get?" Lets finance verify a rule BEFORE it hits real bookings.
 */
router.get(
  '/commission-rules/preview',
  authorize('admin:read'),
  validate({
    query: z.object({
      hostId: z.string().optional(),
      category: z.string().optional(),
      hostTier: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await platformConfigService.resolveCommission(req.query as never));
  }),
);

export const platformConfigAdminRoutes = router;
