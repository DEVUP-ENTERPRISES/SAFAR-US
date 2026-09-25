import { WebhookEventModel } from '../infrastructure/webhook-event.model';
import { paymentGateway } from '../infrastructure/gateway.provider';
import { paymentService } from './payment.service';
import { PaymentModel } from '../infrastructure/payment.model';
import { riskService } from '../../risk/application/risk.service';
import { dashboardRefundService } from './dashboard-refund.service';
import { chargebackService } from './chargeback.service';
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
      id: string;
      metadata?: { bookingId?: string; userId?: string };
      last_payment_error?: { message?: string };
    };
    const bookingId = obj.metadata?.bookingId;
    switch (event.type) {
      case 'payment_intent.succeeded':
        if (bookingId) {
          await paymentService.recordIntentSucceeded(obj.id);
          emit(EVENTS.PAYMENT_SUCCEEDED, bookingId, { bookingId });
        }
        // Best-effort: feeds this user's FUTURE risk decisions, never blocks
        // or reverses a charge that already succeeded.
        if (obj.metadata?.userId) {
          paymentGateway
            .getIntentRisk(obj.id)
            .then((risk) => (risk ? riskService.recordCardRisk(obj.metadata!.userId!, obj.id, risk) : undefined))
            .catch((err) => logger.warn({ err, intentId: obj.id }, 'card risk lookup failed'));
        }
        break;
      case 'charge.refunded': {
        // Book any refund we did not make ourselves (e.g. from the Stripe dashboard).
        const charge = event.data.object as { payment_intent?: string; amount_refunded?: number };
        if (charge.payment_intent && typeof charge.amount_refunded === 'number') {
          await dashboardRefundService.reconcile(charge.payment_intent, charge.amount_refunded);
        }
        if (bookingId) emit(EVENTS.PAYMENT_REFUNDED, bookingId, { bookingId });
        break;
      }
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
      case 'charge.dispute.closed': {
        // A dispute carries its own metadata, not the booking's — resolve it
        // through the payment intent it is against.
        const dispute = event.data.object as { id: string; amount?: number; payment_intent?: string; status?: string };
        // A wallet top-up has no booking: debit the wallet and flag the account instead.
        if (event.type === 'charge.dispute.created' && dispute.payment_intent && typeof dispute.amount === 'number'
          && (await chargebackService.onTopupDispute(dispute.id, dispute.payment_intent, dispute.amount))) break;
        const payment = dispute.payment_intent
          ? await PaymentModel.findOne({ intentId: dispute.payment_intent }).lean<{ bookingId?: string }>()
          : null;
        const disputedBookingId = payment?.bookingId ?? bookingId;
        if (!disputedBookingId) {
          logger.error({ eventId: event.id }, 'CHARGEBACK event could not be matched to a booking');
          break;
        }
        if (event.type === 'charge.dispute.created') {
          logger.error({ bookingId: disputedBookingId, eventId: event.id }, 'CHARGEBACK opened — funds are being reversed');
          emit(EVENTS.PAYMENT_DISPUTED, disputedBookingId, { bookingId: disputedBookingId });
        } else {
          emit(EVENTS.PAYMENT_DISPUTE_CLOSED, disputedBookingId, { bookingId: disputedBookingId, won: dispute.status === 'won' });
        }
        break;
      }
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
