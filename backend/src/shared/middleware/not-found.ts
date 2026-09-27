import type { Request, Response } from 'express';

/** Standardized 404 for unmatched routes (not Express's HTML default). */
export function notFound(_req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      // Never echo the method or path back: it maps the API for anyone probing it.
      message: 'This is not available right now.',
      requestId: res.locals.requestId,
    },
  });
}
