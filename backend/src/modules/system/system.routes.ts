import { Router } from 'express';
import { isMongoHealthy } from '../../infrastructure/database/mongoose.client';
import { isRedisHealthy } from '../../infrastructure/cache/redis.client';
import { sendSuccess } from '../../shared/http/api-response';
import { config } from '../../config';

const router = Router();

/** Liveness: process is up. */
router.get('/health', (_req, res) => {
  sendSuccess(res, { status: 'ok', uptime: process.uptime() });
});

/**
 * Readiness: can this instance actually serve traffic?
 *
 * Mongo is required — without it nothing works, so a failure here must take the
 * instance out of the load balancer. Redis is reported but NOT fatal: sessions
 * degrade gracefully to the signed JWT, so pulling every instance during a
 * cache blip would turn a partial outage into a total one.
 */
router.get('/ready', (_req, res) => {
  const mongo = isMongoHealthy();
  const redis = isRedisHealthy();
  const storage = config.aws.enabled ? 'live' : 'mock';

  const ready = mongo;
  res.status(ready ? 200 : 503).json({
    success: ready,
    data: {
      mongo,
      redis,
      storage,
      degraded: !redis,
      release: config.observability.release,
      env: config.env,
      uptime: Math.round(process.uptime()),
    },
    meta: { requestId: res.locals.requestId },
  });
});

export const systemRoutes = router;
