import { Schema, model } from 'mongoose';

/**
 * Every provider webhook we have already handled.
 *
 * Stripe retries a webhook on any non-2xx, on a timeout, and sometimes simply
 * because it delivers at-least-once. Without a record of what has been seen, a
 * redelivered `payment_intent.succeeded` fires the same domain event twice —
 * and anything that posts to the ledger or advances a booking then does it
 * twice too.
 *
 * Stored in Mongo rather than Redis on purpose: this is a correctness record,
 * not a cache, and a Redis restart must not make a month of money movements
 * replayable.
 *
 * The insert itself is the lock. A unique index means the second concurrent
 * delivery loses on write rather than after a read-then-check, which is the
 * classic race two workers hit at the same millisecond.
 */
export interface WebhookEventDoc {
  _id: string; // provider event id — the natural key
  provider: 'stripe';
  type: string;
  processedAt: Date;
  /**
   * The claim is written BEFORE the event is handled, so the row alone does not
   * mean the work succeeded. Without this distinction a handler that threw left
   * the event marked as seen, and since the endpoint has already answered 200
   * Stripe never redelivers it — a successful charge simply disappears.
   */
  status: 'processing' | 'processed' | 'failed';
  /** Kept only while retrying, so a failed event can be replayed as delivered. */
  payload?: unknown;
  attempts: number;
  lastError?: string;
}

const schema = new Schema<WebhookEventDoc>(
  {
    _id: { type: String, required: true },
    provider: { type: String, required: true, default: 'stripe' },
    type: { type: String, required: true },
    processedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['processing', 'processed', 'failed'], default: 'processing' },
    payload: { type: Schema.Types.Mixed },
    attempts: { type: Number, default: 0 },
    lastError: { type: String },
  },
  { versionKey: false },
);

// Providers stop retrying long before this; 30 days is generous and keeps the
// collection from growing without bound.
schema.index({ processedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

// The retry sweep's only query. Without it that job scans the whole collection
// every few minutes just to find the handful of rows that failed.
schema.index({ status: 1, processedAt: 1 });

export const WebhookEventModel = model<WebhookEventDoc>('WebhookEvent', schema);
