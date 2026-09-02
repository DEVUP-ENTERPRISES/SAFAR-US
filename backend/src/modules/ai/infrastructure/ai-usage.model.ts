import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/**
 * One row per AI call, successful or not.
 *
 * AI spend is the one operating cost that scales with usage in a way nobody
 * notices until the invoice arrives, and "AI costs" as a single number tells
 * you nothing about which feature to cut. Attributing every call to a feature
 * makes that decision answerable, and gives the daily budget cap something
 * real to count.
 *
 * Failed calls are recorded too: an outage shows up as a wall of `ok: false`
 * rows rather than as silence.
 */
export interface AiUsageDoc {
  _id: string;
  /** Which feature spent this — 'damage-review', 'listing-copilot', etc. */
  feature: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  /** US cents, as reported by OpenRouter. */
  costCents: number;
  latencyMs: number;
  ok: boolean;
  error?: string;
  createdAt: Date;
}

const schema = new Schema<AiUsageDoc>(
  {
    _id: { type: String, default: uuid },
    feature: { type: String, required: true, index: true },
    model: { type: String, required: true },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    costCents: { type: Number, default: 0 },
    latencyMs: { type: Number, default: 0 },
    ok: { type: Boolean, default: true },
    error: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

// The budget check runs on every AI call, so the daily sum must be cheap.
schema.index({ createdAt: -1 });
schema.index({ feature: 1, createdAt: -1 });

export const AiUsageModel = model<AiUsageDoc>('AiUsage', schema);
