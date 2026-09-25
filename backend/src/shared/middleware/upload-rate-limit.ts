import rateLimit, { type Store } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import type { Request } from 'express';
import { config } from '../../config';
import { redis, isRedisHealthy } from '../../infrastructure/cache/redis.client';
import { platformConfigService } from '../../modules/platform-config/application/platform-config.service';

/** Per-member cap on upload links, so nobody can mint write access to our bucket at machine speed. */
const store: Store | undefined =
  config.isProd && isRedisHealthy()
    ? new RedisStore({ prefix: 'rl:upload:', sendCommand: (...args: string[]) => redis.call(...(args as [string, ...string[]])) as Promise<never> })
    : undefined;

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: async () => (await platformConfigService.get()).security.uploadUrlsPerHour,
  standardHeaders: true,
  legacyHeaders: false,
  store,
  keyGenerator: (req: Request) => req.principal?.userId ?? req.ip ?? 'unknown',
  message: {
    success: false,
    error: { code: 'TOO_MANY_REQUESTS', message: 'Too many uploads. Please wait a while and try again.' },
  },
  skip: () => !config.isProd,
});
