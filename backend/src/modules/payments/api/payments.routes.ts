import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { stripeGateway } from '../infrastructure/gateway.provider';
import { paymentMethodService } from '../application/payment-method.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess, sendCreated } from '../../../shared/http/api-response';
import { logger } from '../../../infrastructure/logging/logger';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';

const router = Router();

// ── Saved payment methods ────────────────────────────────────────────────
router.get(
  '/methods',
  authenticate,
  asyncHandler(async (req, res) => sendSuccess(res, await paymentMethodService.list(req.principal!.userId))),
);
router.post(
  '/methods/setup-intent',
  authenticate,
  asyncHandler(async (req, res) => sendSuccess(res, await paymentMethodService.setupIntent(req.principal!.userId))),
);
router.post(
  '/methods',
  authenticate,
  validate({
    body: z.object({
      brand: z.string().min(1),
      last4: z.string().length(4),
      expMonth: z.number().int().min(1).max(12),
      expYear: z.number().int().min(2024).max(2100),
      stripePaymentMethodId: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => sendCreated(res, await paymentMethodService.save(req.principal!.userId, req.body))),
);
router.delete(
  '/methods/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    await paymentMethodService.remove(req.principal!.userId, req.params.id);
    sendSuccess(res, { removed: true });
  }),
);
router.post(
  '/methods/:id/default',
  authenticate,
  asyncHandler(async (req, res) => {
    await paymentMethodService.setDefault(req.principal!.userId, req.params.id);
    sendSuccess(res, { default: true });
  }),
);

/**
 * Stripe webhook — the authoritative source of payment status. Raw body is
 * captured in app.ts before JSON parsing so the signature verifies. We never
 * trust client-side "payment succeeded"; we reconcile from here.
 */
router.post('/webhooks/stripe', (req: Request, res: Response) => {
  if (!stripeGateway) {
    res.status(503).json({ success: false, error: { code: 'STRIPE_DISABLED', message: 'Stripe not configured' } });
    return;
  }
  const signature = req.header('stripe-signature');
  if (!signature) {
    res.status(400).json({ success: false, error: { code: 'NO_SIGNATURE', message: 'Missing signature' } });
    return;
  }

  let event;
  try {
    event = stripeGateway.constructEvent(req.body as Buffer, signature);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'stripe webhook signature failed');
    res.status(400).json({ success: false, error: { code: 'BAD_SIGNATURE', message: 'Invalid signature' } });
    return;
  }

  // Fire-and-forget processing; always 200 fast so Stripe doesn't retry storm.
  void (async () => {
    try {
      const obj = event.data.object as { metadata?: { bookingId?: string } };
      const bookingId = obj.metadata?.bookingId;
      switch (event.type) {
        case 'payment_intent.succeeded':
          if (bookingId) emit(EVENTS.PAYMENT_SUCCEEDED, bookingId, { bookingId });
          break;
        case 'charge.refunded':
          if (bookingId) emit(EVENTS.PAYMENT_REFUNDED, bookingId, { bookingId });
          break;
        default:
          break;
      }
    } catch (err) {
      logger.error({ err: (err as Error).message, type: event.type }, 'stripe webhook handler error');
    }
  })();

  res.json({ received: true });
});

export const paymentsRoutes = router;
