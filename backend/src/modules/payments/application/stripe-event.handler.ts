import { WebhookEventModel } from '../infrastructure/webhook-event.model';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Handle one verified Stripe event and record the outcome.
 *
 * Split out of the route so the retry sweep replays an event through exactly
 * the same path a live delivery takes — a separate replay implementation is
 * how the retry and the original quietly drift apart.
 *
 * Never throws: the caller is either a fire-and-forget block or a background
 * job, and the durable record of what happened is the row, not an exception.
 */
export async function runStripeEvent(event: {
  id: string;
  type: string;
  data: { object: unknown };
}): Promise<void> {
  try {
    const obj = event.data.object as {
      metadata?: { bookingId?: string };
      last_payment_error?: { message?: string };
    };
    const bookingId = obj.metadata?.bookingId;
    switch (event.type) {
      case 'payment_intent.succeeded':
        if (bookingId) emit(EVENTS.PAYMENT_SUCCEEDED, bookingId, { bookingId });
        break;
      case 'charge.refunded':
        if (bookingId) emit(EVENTS.PAYMENT_REFUNDED, bookingId, { bookingId });
        break;
      // A card can fail asynchronously, minutes after the booking was made.
      // Unhandled, that booking sat as paid with no money behind it.
      case 'payment_intent.payment_failed':
        if (bookingId) {
          emit(EVENTS.PAYMENT_FAILED, bookingId, {
            bookingId,
            reason: obj.last_payment_error?.message,
          });
          logger.warn(
            { bookingId, reason: obj.last_payment_error?.message },
            'payment failed after the fact',
          );
        }
        break;
      // Money is being pulled back by the cardholder's bank. Ops must know
      // immediately; silently losing this is how a marketplace pays a host
      // out of a charge that no longer exists.
      case 'charge.dispute.created':
        logger.error({ bookingId, eventId: event.id }, 'CHARGEBACK opened — funds are being reversed');
        if (bookingId) emit(EVENTS.PAYMENT_DISPUTED, bookingId, { bookingId });
        break;
      default:
        break;
    }

    // Handled. Drop the payload — it was only kept to make a replay possible.
    await WebhookEventModel.updateOne(
      { _id: event.id },
      { status: 'processed', processedAt: new Date(), $unset: { payload: 1 } },
    );
  } catch (err) {
    // Marked failed rather than left as processed, so the sweep can replay it.
    // Silently swallowing this is how a charge goes through with no booking.
    await WebhookEventModel.updateOne(
      { _id: event.id },
      { status: 'failed', lastError: (err as Error).message, $inc: { attempts: 1 } },
    ).catch(() => undefined);
    logger.error(
      { err: (err as Error).message, type: event.type, eventId: event.id },
      'stripe webhook handler failed — queued for retry',
    );
  }
}
