import type { Store } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { config } from '../../config';
import { redis, isRedisHealthy } from '../../infrastructure/cache/redis.client';

/**
 * Shared store for the global limiter.
 *
 * express-rate-limit defaults to an in-process Map. Behind more than one
 * instance that means each process counts separately, so the real ceiling is
 * the configured max times the instance count, and a restart clears it — the
 * DDoS backstop got weaker exactly as the fleet grew.
 *
 * Undefined outside production, which keeps local runs and the test suite off
 * Redis entirely (the same choice the auth limiter already makes).
 */
export function globalRateLimitStore(): Store | undefined {
  // In-memory (undefined) unless Redis is actually up. A degraded prod-test box
  // still gets per-instance limiting instead of a 500 on every request from a
  // dead Redis connection.
  if (!config.isProd || !isRedisHealthy()) return undefined;
  return new RedisStore({
    prefix: 'rl:global:',
    sendCommand: (...args: string[]) => redis.call(...(args as [string, ...string[]])) as Promise<never>,
  });
}
