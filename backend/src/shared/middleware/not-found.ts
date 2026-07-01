import type { Request, Response } from 'express';

/** Standardized 404 for unmatched routes (not Express's HTML default). */
export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Cannot ${req.method} ${req.path}`,
      requestId: res.locals.requestId,
    },
  });
}
