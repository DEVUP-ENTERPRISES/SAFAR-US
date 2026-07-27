import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { kycService } from '../application/kyc.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';
import { config } from '../../../config';
import { logger } from '../../../infrastructure/logging/logger';

const router = Router();

const submitSchema = z.object({
  level: z.enum(['basic', 'full']).optional(),
  documents: z
    .array(
      z.object({
        type: z.enum(['license', 'passport', 'national_id', 'selfie']),
        url: z.string().url(),
      }),
    )
    .min(1),
});

router.post(
  '/submit',
  authenticate,
  validate({ body: submitSchema }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await kycService.submit(req.principal!.userId, req.body));
  }),
);

/**
 * Start an automated identity check (Stripe Identity). The app opens the
 * returned client secret / URL; the decision arrives by webhook.
 */
router.post(
  '/verification-session',
  authenticate,
  asyncHandler(async (req, res) => {
    sendCreated(res, await kycService.startVerification(req.principal!.userId));
  }),
);

/**
 * Provider webhook — the authoritative source of the verification decision.
 * Raw body is required for signature verification, so this route is mounted
 * with its own raw parser BEFORE the JSON body parser (see app wiring).
 */
router.post(
  '/webhook',
  asyncHandler(async (req: Request, res: Response) => {
    const sig = req.headers['stripe-signature'];
    try {
      await kycService.handleWebhook(req.body as Buffer, Array.isArray(sig) ? sig[0] : sig ?? '');
      res.json({ received: true });
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'identity webhook rejected');
      res.status(400).json({ error: 'invalid signature' });
    }
  }),
);

/** Dev/test only: force a decision offline. Refused when a live provider runs. */
if (!config.kyc.identityEnabled) {
  router.post(
    '/dev/decide',
    authenticate,
    validate({
      body: z.object({
        status: z.enum(['verified', 'rejected']),
        licenceExpiry: z.string().optional(),
        licenceNumberHash: z.string().optional(),
        reason: z.string().optional(),
      }),
    }),
    asyncHandler(async (req, res) => {
      await kycService.forceDecision(req.principal!.userId, req.body);
      sendSuccess(res, { applied: true });
    }),
  );
}

router.get(
  '/status',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await kycService.getStatus(req.principal!.userId));
  }),
);

export const kycRoutes = router;
