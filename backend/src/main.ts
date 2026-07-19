import http from 'http';
import { createApp } from './app';
import { config } from './config';
import { logger } from './infrastructure/logging/logger';
import { connectMongo, disconnectMongo } from './infrastructure/database/mongoose.client';
import { redis, connectRedis, disconnectRedis } from './infrastructure/cache/redis.client';
import { setKvStore, RedisKvStore, InMemoryKvStore } from './infrastructure/cache/kv-store';
import { registerEventSubscribers } from './bootstrap/event-subscriptions';
import { seedAdmin } from './bootstrap/seed-admin';
import { initRealtime } from './realtime';
import { initJobs } from './jobs';
import { isRedisHealthy } from './infrastructure/cache/redis.client';

/**
 * Composition root: connect backing services, start HTTP, wire graceful
 * shutdown so deploys/autoscaling never drop in-flight requests.
 *
 * MongoDB is required (source of truth). Redis is preferred for sessions/
 * cache; if unavailable in local dev we fall back to an in-memory KV store
 * so the app still boots and the auth flow works. In production Redis is
 * mandatory for multi-instance correctness.
 */
async function bootstrap(): Promise<void> {
  await connectMongo();

  try {
    await connectRedis();
    setKvStore(new RedisKvStore(redis));
    logger.info('Session/cache store: Redis');
  } catch (err) {
    if (config.isProd) throw err;
    redis.disconnect();
    setKvStore(new InMemoryKvStore());
    logger.warn(
      { err: (err as Error).message },
      '⚠️  Redis unavailable — using in-memory KV store (dev only, not multi-instance safe)',
    );
  }

  await seedAdmin();
  registerEventSubscribers();

  // Background jobs need Redis (BullMQ). Skip gracefully in dev without Redis.
  if (isRedisHealthy()) {
    await initJobs().catch((err) => logger.error({ err: err.message }, 'jobs init failed'));
  } else {
    logger.warn('⚠️  Redis unavailable — background jobs (BullMQ) disabled');
  }

  const app = createApp();
  const server = http.createServer(app);

  initRealtime(server);

  server.listen(config.app.port, () => {
    logger.info(`🚀 ${config.app.name} API listening on :${config.app.port} (${config.env})`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.warn(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      await Promise.allSettled([disconnectMongo(), disconnectRedis()]);
      logger.info('Shutdown complete');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Fatal boot error');
  process.exit(1);
});
