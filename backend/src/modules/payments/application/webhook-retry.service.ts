import { WebhookEventModel } from '../infrastructure/webhook-event.model';
import { runStripeEvent } from './stripe-event.handler';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Replays webhook events whose handler failed.
 *
 * The endpoint answers 200 as soon as the signature checks out, which is what
 * Stripe wants — but it means Stripe will never redeliver. So a handler that
 * threw used to end the event's life right there: the guest's card was charged
 * and the booking never advanced, with only a log line to say so.
 *
 * The stored payload makes the replay identical to the original delivery, and
 * it runs through the same dispatcher the live path uses so the two cannot
 * drift apart.
 */

/** Past this, a human needs to look — replaying again will not fix it. */
const MAX_ATTEMPTS = 6;

export const webhookRetryService = {
  async retryFailed(): Promise<{ retried: number; exhausted: number }> {
    const due = await WebhookEventModel.find({
      status: 'failed',
      attempts: { $lt: MAX_ATTEMPTS },
    })
      .sort({ processedAt: 1 })
      // Bounded so one bad deploy's backlog cannot monopolise the worker.
      .limit(50)
      .lean<{ _id: string; type: string; payload?: unknown; attempts: number }[]>();

    for (const row of due) {
      if (!row.payload) {
        // Nothing to replay with. Retrying forever would just burn attempts.
        await WebhookEventModel.updateOne(
          { _id: row._id },
          { attempts: MAX_ATTEMPTS, lastError: 'payload missing — cannot replay' },
        );
        continue;
      }
      await runStripeEvent(row.payload as Parameters<typeof runStripeEvent>[0]);
    }

    // Anything out of attempts is a real incident: money moved at the provider
    // and this side never recorded it.
    const exhausted = await WebhookEventModel.countDocuments({
      status: 'failed',
      attempts: { $gte: MAX_ATTEMPTS },
    });
    if (exhausted > 0) {
      logger.error(
        { exhausted },
        'stripe webhooks permanently failed after retries — charges may have no booking behind them',
      );
    }
    if (due.length) logger.warn({ retried: due.length }, 'replayed failed stripe webhooks');
    return { retried: due.length, exhausted };
  },
};
