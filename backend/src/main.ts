import http from 'http';
import { config } from './config';
import { logger } from './infrastructure/logging/logger';
import { connectMongo, disconnectMongo } from './infrastructure/database/mongoose.client';
import { redis, connectRedis, disconnectRedis } from './infrastructure/cache/redis.client';
import { setKvStore, RedisKvStore, InMemoryKvStore } from './infrastructure/cache/kv-store';
import { registerEventSubscribers } from './bootstrap/event-subscriptions';
import { installCrashHandlers } from './infrastructure/observability/error-reporter';
import { seedAdmin, enforceSingleSuperAdmin } from './bootstrap/seed-admin';
import { initRealtime } from './realtime';
import { initJobs, closeJobs } from './jobs';
import { verifyChannels } from './modules/notifications/infrastructure/channel.providers';
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
  // First thing: a crash during boot is exactly when you most need it recorded.
  installCrashHandlers();
  await connectMongo();

  try {
    await connectRedis();
    setKvStore(new RedisKvStore(redis));
    logger.info('Session/cache store: Redis');
  } catch (err) {
    // Degrade instead of crash. Redis backs sessions, rate limits and the job
    // queue, so running without it is NOT multi-instance safe and loses that
    // state on restart — but for a single-box prod-test it beats a dead server.
    // Logged at error level in production so the degradation is never silent.
    redis.disconnect();
    setKvStore(new InMemoryKvStore());
    const detail = { err: (err as Error).message };
    if (config.isProd) {
      logger.error(
        detail,
        '⚠️  Redis unavailable — running on the IN-MEMORY store. Sessions, rate limits and background jobs are degraded and NOT shared across instances. Install/point Redis for real production.',
      );
    } else {
      logger.warn(detail, '⚠️  Redis unavailable — using in-memory KV store (dev, not multi-instance safe)');
    }
  }

  await seedAdmin();
  await enforceSingleSuperAdmin();
  registerEventSubscribers();

  // Background jobs need Redis (BullMQ). Skip gracefully in dev without Redis.
  if (isRedisHealthy()) {
    await initJobs().catch((err) => logger.error({ err: err.message }, 'jobs init failed'));
    // Non-blocking: a mail server being slow must not delay accepting traffic.
    void verifyChannels();
  } else {
    logger.warn('⚠️  Redis unavailable — background jobs (BullMQ) disabled');
  }

  // Imported here, AFTER the Redis decision, so the rate limiters it pulls in
  // pick the Redis-backed or in-memory store based on the real connection state.
  const { createApp } = await import('./app');
  const app = createApp();
  const server = http.createServer(app);

  const io = initRealtime(server);

  server.listen(config.app.port, () => {
    logger.info(`🚀 ${config.app.name} API listening on :${config.app.port} (${config.env})`);
  });

  /*
   * Graceful shutdown, in the only order that does not drop work.
   *
   * The previous version called server.close() and waited on its callback —
   * but open WebSockets keep the HTTP server from ever closing, so it always
   * fell through to the hard-kill timer and exited 1, dropping in-flight
   * requests AND killing in-flight jobs (payout transfers included) the moment
   * Redis went away.
   *
   *   1. Boot the WebSocket clients so the HTTP server can actually drain.
   *   2. Stop accepting new HTTP and let in-flight requests finish.
   *   3. Let the background worker finish its CURRENT job, then stop.
   *   4. Only now disconnect Mongo and Redis — the steps above need them.
   *
   * A longer safety timer still forces exit if any step hangs, but the happy
   * path exits 0 with nothing lost.
   */
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.warn(`${signal} received — shutting down gracefully`);
    const hardKill = setTimeout(() => {
      logger.error('graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 25_000);
    hardKill.unref();
    try {
      io.disconnectSockets(true);
      await io.close().catch(() => undefined);
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await closeJobs().catch((err) =>
        logger.error({ err: (err as Error).message }, 'closeJobs failed during shutdown'),
      );
      await Promise.allSettled([disconnectMongo(), disconnectRedis()]);
      logger.info('Shutdown complete');
      clearTimeout(hardKill);
      process.exit(0);
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'error during graceful shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Fatal boot error');
  process.exit(1);
});
