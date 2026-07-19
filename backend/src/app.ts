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
import { errorHandler } from './shared/middleware/error-handler';
import { notFound } from './shared/middleware/not-found';
import { buildApiRouter } from './routes';

/**
 * Express app factory. No server.listen here — this lets tests import the
 * app without opening a port, and keeps process bootstrap in main.ts.
 * Middleware order matters: reject cheap & early, security before logic,
 * error handler last. (See docs 06 — Middleware Pipeline.)
 */
export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);

  // 1. correlation id
  app.use(requestContext);

  // 2. security headers
  app.use(helmet());

  // 3. cors — reflect allowed origins (or any origin when '*' configured).
  const allowAllOrigins = config.cors.origins.some((o) => o === '*' || o.includes('*'));
  app.use(
    cors({
      origin(origin, cb) {
        // No Origin header (same-origin, curl, server-to-server) → allow.
        if (!origin || allowAllOrigins || config.cors.origins.includes(origin)) {
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
  app.use(
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // 8. API routes
  app.use(config.app.apiPrefix, buildApiRouter());

  // 9. 404 + central error handler (must be last)
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
