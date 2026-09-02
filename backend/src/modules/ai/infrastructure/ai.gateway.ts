import { config } from '../../../config';
import { logger } from '../../../infrastructure/logging/logger';
import { AiUsageModel } from './ai-usage.model';

/**
 * OpenRouter gateway.
 *
 * Three rules hold everywhere AI is used in this codebase, and they live here
 * rather than in each feature so no feature can opt out of them:
 *
 *  1. No key means the feature is OFF, not broken. `isEnabled()` is checked by
 *     callers and the whole surface hides itself. Same contract as the maps and
 *     payment provider chains.
 *  2. Spend is capped per day and recorded per call. A prompt-injection loop or
 *     a retry storm costs a known maximum, not an unbounded bill.
 *  3. Every call is attributed — feature, model, tokens, cost, latency — so the
 *     admin can see what AI actually costs per feature rather than as one line.
 */

export interface AiMessage {
  role: 'system' | 'user';
  /** Text, or a mixed content array for vision calls. */
  content: string | AiContentPart[];
}

export type AiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface AiCallOptions {
  /** Which feature is spending — required, because untagged spend is unauditable. */
  feature: string;
  messages: AiMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Ask the model for strict JSON. Used by every structured feature. */
  json?: boolean;
  timeoutMs?: number;
}

export interface AiResult<T = string> {
  content: T;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costCents: number;
  latencyMs: number;
}

export class AiDisabledError extends Error {
  constructor() {
    super('AI is not configured');
    this.name = 'AiDisabledError';
  }
}

export class AiBudgetExceededError extends Error {
  constructor(spentCents: number, capCents: number) {
    super(`AI daily budget exhausted (${spentCents}c of ${capCents}c)`);
    this.name = 'AiBudgetExceededError';
  }
}

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export const aiGateway = {
  isEnabled(): boolean {
    return config.ai.enabled;
  },

  /** Cents spent since midnight UTC, across every feature. */
  async spentTodayCents(): Promise<number> {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const [row] = await AiUsageModel.aggregate<{ total: number }>([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: null, total: { $sum: '$costCents' } } },
    ]);
    return row?.total ?? 0;
  },

  async complete(opts: AiCallOptions): Promise<AiResult<string>> {
    if (!config.ai.enabled) throw new AiDisabledError();

    // Check the cap BEFORE spending, not after.
    const cap = config.ai.dailyBudgetCents;
    if (cap > 0) {
      const spent = await this.spentTodayCents();
      if (spent >= cap) throw new AiBudgetExceededError(spent, cap);
    }

    const model = opts.model ?? config.ai.model;
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${config.ai.apiKey}`,
          'Content-Type': 'application/json',
          // OpenRouter attributes traffic with these; harmless if unset upstream.
          'HTTP-Referer': config.app.publicUrl,
          'X-Title': 'SAFAR-US',
        },
        body: JSON.stringify({
          model,
          messages: opts.messages,
          max_tokens: opts.maxTokens ?? 1200,
          temperature: opts.temperature ?? 0.2,
          ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`OpenRouter ${res.status}: ${detail.slice(0, 300)}`);
      }

      const body = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
        model?: string;
      };

      const content = body.choices?.[0]?.message?.content ?? '';
      const promptTokens = body.usage?.prompt_tokens ?? 0;
      const completionTokens = body.usage?.completion_tokens ?? 0;
      // OpenRouter reports cost in USD; store cents so it sums with the ledger's units.
      const costCents = Math.round((body.usage?.cost ?? 0) * 100);
      const latencyMs = Date.now() - started;

      await AiUsageModel.create({
        feature: opts.feature,
        model: body.model ?? model,
        promptTokens,
        completionTokens,
        costCents,
        latencyMs,
        ok: true,
      }).catch(() => undefined); // Accounting must never fail the caller.

      return { content, model: body.model ?? model, promptTokens, completionTokens, costCents, latencyMs };
    } catch (err) {
      await AiUsageModel.create({
        feature: opts.feature,
        model,
        promptTokens: 0,
        completionTokens: 0,
        costCents: 0,
        latencyMs: Date.now() - started,
        ok: false,
        error: (err as Error).message.slice(0, 300),
      }).catch(() => undefined);
      logger.warn(`AI call failed (${opts.feature}): ${(err as Error).message}`);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  },

  /**
   * Same as complete(), but parses strict JSON.
   *
   * Models wrap JSON in prose or fences often enough that a bare JSON.parse is
   * a real source of production failures, so the fence is stripped and the
   * outermost object extracted before parsing.
   */
  async completeJson<T>(opts: AiCallOptions): Promise<AiResult<T>> {
    const r = await this.complete({ ...opts, json: true });
    const cleaned = r.content
      .replace(/^\s*```(?:json)?/i, '')
      .replace(/```\s*$/, '')
      .trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
    return { ...r, content: JSON.parse(slice) as T };
  },
};

logger.info(
  `AI: ${config.ai.enabled ? `OpenRouter (${config.ai.model})` : 'disabled — set OPENROUTER_API_KEY'}`,
);
