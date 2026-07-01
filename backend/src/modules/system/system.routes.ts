import { Router } from 'express';
import { isMongoHealthy } from '../../infrastructure/database/mongoose.client';
import { isRedisHealthy } from '../../infrastructure/cache/redis.client';
import { sendSuccess } from '../../shared/http/api-response';

const router = Router();

/** Liveness: process is up. */
router.get('/health', (_req, res) => {
  sendSuccess(res, { status: 'ok', uptime: process.uptime() });
});

/** Readiness: dependencies reachable. */
router.get('/ready', (_req, res) => {
  const mongo = isMongoHealthy();
  const redis = isRedisHealthy();
  const ready = mongo && redis;
  res.status(ready ? 200 : 503).json({
    success: ready,
    data: { mongo, redis },
    meta: { requestId: res.locals.requestId },
  });
});

export const systemRoutes = router;
