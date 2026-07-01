import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps async controllers so any rejected promise is forwarded to the
 * central error handler instead of crashing the process or hanging.
 */
export const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
