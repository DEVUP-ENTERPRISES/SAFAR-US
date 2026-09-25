import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { config } from '../../config';
import { redis, isRedisHealthy } from '../../infrastructure/cache/redis.client';

/**
 * Strict brute-force limiter for credential and OTP endpoints. The global
 * limiter (≈120/min across everything) is a DDoS backstop, not password
 * protection — login, registration, OTP and OAuth need a much tighter, per-IP
 * cap so an attacker can't grind passwords or spam codes.
 *
 * Backed by Redis in production so the cap is shared across every instance;
 * skipped entirely in dev/test so local e2e suites aren't throttled.
 *
 * Only wired to Redis when Redis is actually healthy. If it isn't (a degraded
 * prod-test box), the store is left undefined so express-rate-limit uses its
 * in-memory store — the limiter still works per-instance, instead of erroring
 * on a dead connection every request. This module is loaded after the boot-time
 * Redis decision (main.ts imports the app lazily), so the check is accurate.
 */
const buildLimiter = (prefix: string) =>
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    // Only wired to Redis when healthy; otherwise express-rate-limit's in-memory store.
    store:
      config.isProd && isRedisHealthy()
        ? new RedisStore({ prefix, sendCommand: (...args: string[]) => redis.call(...(args as [string, ...string[]])) as Promise<never> })
        : undefined,
    message: {
      success: false,
      error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Please try again in a few minutes.' },
    },
    skip: () => !config.isProd,
  });

export const authLimiter = buildLimiter('rl:auth:');

// Login gets its own bucket so registering or contacting us never eats a member's sign-in attempts.
export const loginLimiter = buildLimiter('rl:login:');
