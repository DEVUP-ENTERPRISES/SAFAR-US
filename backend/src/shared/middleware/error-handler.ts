import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { AppError } from '../../core/errors/app-error';
import { reportError } from '../../infrastructure/observability/error-reporter';

/**
 * The single place errors become HTTP responses. Recognizes domain errors,
 * known infra errors (Zod, Mongo duplicate key), and falls back to a safe
 * 500 that never leaks internals to the client.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const requestId = res.locals.requestId as string | undefined;

  if (err instanceof AppError) {
    res.status(err.httpStatus).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details, requestId },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: err.issues.map((i) => ({ field: i.path.join('.'), issue: i.message })),
        requestId,
      },
    });
    return;
  }

  // Mongo duplicate key
  if (err instanceof mongoose.mongo.MongoServerError && err.code === 11000) {
    res.status(409).json({
      success: false,
      error: { code: 'DUPLICATE_KEY', message: 'Resource already exists', requestId },
    });
    return;
  }

  // Unknown / unexpected → report and log full detail, return a generic 500.
  // Only genuinely unexpected errors are reported: AppError and ZodError are
  // handled outcomes above, and paging on them would bury the real failures.
  reportError(err, {
    requestId,
    path: req.path,
    method: req.method,
    userId: req.principal?.userId,
  });
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', requestId },
  });
}
