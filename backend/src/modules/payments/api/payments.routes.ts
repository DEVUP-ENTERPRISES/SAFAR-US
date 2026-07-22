import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { stripeGateway } from '../infrastructure/gateway.provider';
import { paymentMethodService } from '../application/payment-method.service';
import { depositService } from '../application/deposit.service';
import { bookingService } from '../../bookings/application/booking.service';
import { authorize } from '../../../shared/middleware/authorize';
import { ForbiddenError } from '../../../core/errors/app-error';
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
/**
 * The security deposit on a booking — what is held, and what became of it.
 * Visible to the guest whose card carries it and the host on the other side;
 * the amount is not a secret, and "when do I get my $500 back" is the single
 * most common post-trip support question in this category.
 */
router.get(
  '/deposits/:bookingId',
  authenticate,
  asyncHandler(async (req, res) => {
    const booking = await bookingService.getDoc(req.params.bookingId);
    const isGuest = booking.guestId === req.principal!.userId;
    const isHost = await bookingService.isHostOwner(req.principal!.userId, booking.hostId);
    const isStaff = req.principal!.permissions.includes('*') ||
      req.principal!.permissions.includes('booking:read:any');
    if (!isGuest && !isHost && !isStaff) {
      throw new ForbiddenError('Not a participant of this booking');
    }

    const deposit = await depositService.forBooking(req.params.bookingId);
    if (!deposit) {
      sendSuccess(res, { held: false });
      return;
    }
    sendSuccess(res, {
      held: deposit.status === 'authorized',
      amount: { amount: deposit.amount, currency: deposit.currency },
      captured: { amount: deposit.capturedAmount, currency: deposit.currency },
      status: deposit.status,
      reason: deposit.releasedReason ?? null,
      settledAt: deposit.releasedAt ?? null,
    });
  }),
);

/**
 * Settle a claim against the deposit. Staff only, and deliberately so: a host
 * must not be able to reach into a guest's authorisation unilaterally. The
 * host files a claim with evidence; an operator assesses it and captures here.
 */
router.post(
  '/deposits/:bookingId/capture',
  authenticate,
  authorize('claim:manage'),
  validate({
    body: z.object({
      amount: z.number().int().positive(),
      reason: z.string().min(10).max(500),
    }),
  }),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.getDoc(req.params.bookingId);
    const taken = await depositService.capture(
      req.params.bookingId,
      { amount: req.body.amount, currency: booking.priceBreakdown.total.currency },
      req.body.reason,
      booking.hostId,
    );
    sendSuccess(res, { captured: taken });
  }),
);

/** Release a hold early — an operator clearing a guest before the job runs. */
router.post(
  '/deposits/:bookingId/release',
  authenticate,
  authorize('claim:manage'),
  validate({ body: z.object({ reason: z.string().min(3).max(500) }) }),
  asyncHandler(async (req, res) => {
    const released = await depositService.release(req.params.bookingId, req.body.reason);
    sendSuccess(res, { released });
  }),
);

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
