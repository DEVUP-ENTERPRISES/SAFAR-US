import './shared/http/request-augmentation';
import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { logger } from './infrastructure/logging/logger';
import { requestContext } from './shared/middleware/request-context';
import { deviceContext } from './shared/middleware/device-context';
import { errorHandler } from './shared/middleware/error-handler';
import { notFound } from './shared/middleware/not-found';
import { buildApiRouter } from './routes';
import { globalRateLimitStore } from './shared/middleware/rate-limit-store';

/**
 * Express app factory. No server.listen here — this lets tests import the
 * app without opening a port, and keeps process bootstrap in main.ts.
 * Middleware order matters: reject cheap & early, security before logic,
 * error handler last. (See docs 06 — Middleware Pipeline.)
 */
export function createApp(): Express {
  const app = express();

  /*
   * Must match the real number of proxies in front of this process.
   *
   * It was hardcoded to 1 while the documented topology is Cloudflare ->
   * Nginx -> Node, which is two. With 1, Express walks one hop from the right
   * of X-Forwarded-For and lands on the CLOUDFLARE EDGE address rather than
   * the client — so every IP-keyed decision below (both rate limiters, the
   * audit trail, abuse detection) collapses onto a handful of Cloudflare POPs.
   * Ten failed logins from anywhere in a metro would lock out every user
   * routed through that datacenter.
   *
   * Setting it too high is the opposite failure — a client could forge
   * X-Forwarded-For and appear as any address — so this is deployment truth,
   * not a tunable, and it lives in env where the deployment is described.
   */
  app.set('trust proxy', config.trustProxyHops);

  // Don't advertise the server framework. Helmet also strips this, but stating
  // it explicitly makes the intent obvious and covers any window before helmet.
  app.disable('x-powered-by');

  // 1. correlation id
  app.use(requestContext);

  // 2. security headers
  app.use(deviceContext);
  app.use(helmet());

  // 3. cors — reflect allowed origins (or any origin when '*' configured).
  const allowAllOrigins = config.cors.origins.some((o) => o === '*' || o.includes('*'));
  // The production web origins, baked in as a safety net so the live site works
  // even if CORS_ORIGINS was not updated on the server. CORS_ORIGINS still adds
  // to this (previews, extra domains); this just guarantees the known ones.
  const alwaysAllow = ['https://www.axonycs.com', 'https://axonycs.com'];
  const allowed = new Set([...config.cors.origins, ...alwaysAllow]);
  app.use(
    cors({
      origin(origin, cb) {
        // No Origin header (same-origin, curl, server-to-server) → allow.
        if (!origin || allowAllOrigins || allowed.has(origin)) {
          return cb(null, true);
        }
        return cb(null, false);
      },
      credentials: true,
    }),
  );

  // 4. compression
  app.use(compression());

  // 4b. Stripe webhook needs the RAW body for signature verification, so
  //     capture it before JSON parsing runs on that exact path.
  app.use(`${config.app.apiPrefix}/payments/webhooks/stripe`, express.raw({ type: '*/*' }));
  app.use(`${config.app.apiPrefix}/kyc/webhook`, express.raw({ type: '*/*' }));

  // 5. body parsing (uploads go to S3 via signed URLs, so bodies stay small)
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // 6. structured request logging
  app.use(
    pinoHttp({
      logger,
      genReqId: (_req, res) => res.locals.requestId as string,
      autoLogging: { ignore: (req) => req.url === '/api/v1/system/health' },
    }),
  );

  // 7. coarse global rate limiter (DDoS backstop; tighter per-route limiters added later)
  //
  // Redis-backed in production for the same reason the auth limiter is: the
  // default store is per-process memory, so the effective ceiling was
  // RATE_LIMIT_MAX multiplied by the number of instances, and it reset to zero
  // on every deploy. A backstop that loosens as you scale out is not a
  // backstop.
  app.use(
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
      store: globalRateLimitStore(),
    }),
  );

  // 8. API routes
  app.use(config.app.apiPrefix, buildApiRouter());

  // 9. 404 + central error handler (must be last)
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
