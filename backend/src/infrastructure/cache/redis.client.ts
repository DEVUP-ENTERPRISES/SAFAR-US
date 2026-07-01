import Redis from 'ioredis';
import { config } from '../../config';
import { logger } from '../logging/logger';

/**
 * Shared Redis client. Used for cache, rate limiting, sessions and (later)
 * BullMQ queues. `lazyConnect` lets bootstrap decide when to connect; a
 * bounded retry strategy makes the initial connect fail fast so local dev
 * can fall back to the in-memory KV store instead of hanging.
 */
export const redis = new Redis(config.redis.url, {
  lazyConnect: true,
  connectTimeout: 3000,
  maxRetriesPerRequest: 2,
  enableReadyCheck: true,
  retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
});

redis.on('connect', () => logger.info('✅ Redis connected'));
redis.on('error', (err) => logger.debug({ err: err.message }, 'Redis error'));

export async function connectRedis(): Promise<void> {
  if (redis.status === 'ready') return;
  await redis.connect();
}

export async function disconnectRedis(): Promise<void> {
  try {
    if (redis.status !== 'end') await redis.quit();
  } catch {
    redis.disconnect();
  }
}

export function isRedisHealthy(): boolean {
  return redis.status === 'ready';
}
