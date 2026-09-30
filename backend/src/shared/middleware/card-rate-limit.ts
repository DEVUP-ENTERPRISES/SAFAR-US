import rateLimit, { type Store } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import type { Request } from 'express';
import { config } from '../../config';
import { redis, isRedisHealthy } from '../../infrastructure/cache/redis.client';
import { platformConfigService } from '../../modules/platform-config/application/platform-config.service';

/**
 * Per-member cap on anything that touches a card (top-up, save a card, book,
 * pay). Without it a stolen-card list can be run through us at machine speed,
 * which earns Stripe fees, disputes and eventually a suspended account. The
 * count is admin-configurable; the window is fixed at an hour. Keyed on the
 * member, falling back to the address for a caller who is not signed in.
 */
const store: Store | undefined =
  config.isProd && isRedisHealthy()
    ? new RedisStore({ prefix: 'rl:card:', sendCommand: (...args: string[]) => redis.call(...(args as [string, ...string[]])) as Promise<never> })
    : undefined;

export const cardLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: async () => (await platformConfigService.get()).security.cardAttemptsPerHour,
  standardHeaders: true,
  legacyHeaders: false,
  store,
  keyGenerator: (req: Request) => req.principal?.userId ?? req.ip ?? 'unknown',
  // Only failed attempts count: card testing shows up as declines, while a guest adding a card and booking succeeds.
  skipSuccessfulRequests: true,
  message: (req: Request) => {
    const reset = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
    const minutes = reset ? Math.max(1, Math.ceil((+reset - Date.now()) / 60_000)) : 60;
    return {
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: `For your security, card payments are paused on your account after several declines. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}, or contact support and we’ll help you book.`,
      },
    };
  },
  skip: () => !config.isProd,
});
