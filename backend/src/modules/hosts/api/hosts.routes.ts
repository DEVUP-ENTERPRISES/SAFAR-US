import { Router } from 'express';
import { z } from 'zod';
import { hostService } from '../application/host.service';
import { hostProfileService } from '../application/host-profile.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';

const router = Router();

const onboardSchema = z.object({
  displayName: z.string().min(2).max(80),
  bio: z.string().max(500).optional(),
});

router.post(
  '/onboard',
  authenticate,
  validate({ body: onboardSchema }),
  asyncHandler(async (req, res) => {
    const host = await hostService.onboard(
      req.principal!.userId,
      req.body.displayName,
      req.body.bio,
    );
    sendCreated(res, host);
  }),
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const host = await hostService.requireHostForUser(req.principal!.userId);
    sendSuccess(res, host);
  }),
);

const profileSchema = z.object({
  displayName: z.string().min(2).max(80).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().max(700).optional(),
  avatarKey: z.string().max(512).optional(),
  languages: z.array(z.string().min(2).max(40)).max(10).optional(),
  city: z.string().max(80).optional(),
  work: z.string().max(80).optional(),
  hostType: z.enum(['individual', 'business']).optional(),
  isFleetOwner: z.boolean().optional(),
  businessProfile: z
    .object({
      legalName: z.string().optional(),
      registrationNumber: z.string().optional(),
      address: z.string().optional(),
      supportPhone: z.string().optional(),
      supportEmail: z.string().email().optional(),
    })
    .optional(),
  taxInfo: z
    .object({
      taxId: z.string().optional(),
      country: z.string().optional(),
      businessTax: z.boolean().optional(),
    })
    .optional(),
  bankingDetails: z
    .object({
      accountHolder: z.string().optional(),
      accountNumberMasked: z.string().optional(),
      ifscOrRouting: z.string().optional(),
      bankName: z.string().optional(),
    })
    .optional(),
});

router.patch(
  '/me',
  authenticate,
  validate({ body: profileSchema }),
  asyncHandler(async (req, res) => {
    const host = await hostService.updateProfile(req.principal!.userId, req.body);
    sendSuccess(res, host);
  }),
);

/**
 * Public host profile — what a guest sees on a listing and on /hosts/:id.
 * Unauthenticated on purpose: shoppers compare hosts before signing up.
 */
router.get(
  '/:id/public',
  asyncHandler(async (req, res) => {
    sendSuccess(res, await hostProfileService.publicProfile(req.params.id));
  }),
);

/** A host's bookable cars, for their public profile. Listed + verified only. */
router.get(
  '/:id/vehicles',
  asyncHandler(async (req, res) => {
    sendSuccess(res, await hostProfileService.publicVehicles(req.params.id));
  }),
);

// Ops-only host verification
router.post(
  '/:id/verify',
  authenticate,
  authorize('vehicle:verify'),
  asyncHandler(async (req, res) => {
    await hostService.verify(req.params.id);
    sendSuccess(res, { verified: true });
  }),
);

export const hostsRoutes = router;
