import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Assigns a correlation id to every request (adopting an inbound
 * X-Request-Id from the proxy if present). Echoed on the response and
 * available to logs so any user report can be traced to exact logs.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const requestId = incoming && incoming.length <= 100 ? incoming : uuidv4();
  res.locals.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}
