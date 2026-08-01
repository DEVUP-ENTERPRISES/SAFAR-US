import rateLimit, { type Store } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { config } from '../../config';
import { redis } from '../../infrastructure/cache/redis.client';

/**
 * Strict brute-force limiter for credential and OTP endpoints. The global
 * limiter (≈120/min across everything) is a DDoS backstop, not password
 * protection — login, registration, OTP and OAuth need a much tighter, per-IP
 * cap so an attacker can't grind passwords or spam codes.
 *
 * Backed by Redis in production so the cap is shared across every instance;
 * skipped entirely in dev/test so local e2e suites aren't throttled.
 */
const store: Store | undefined = config.isProd
  ? new RedisStore({ prefix: 'rl:auth:', sendCommand: (...args: string[]) => redis.call(...(args as [string, ...string[]])) as Promise<never> })
  : undefined;

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store,
  message: {
    success: false,
    error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Please try again in a few minutes.' },
  },
  skip: () => !config.isProd,
});
