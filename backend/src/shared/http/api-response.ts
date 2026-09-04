import type { Response } from 'express';
import { normaliseMediaUrls } from './media-url';

/**
 * Standard success envelope used by every endpoint.
 * Errors are produced centrally by the error handler.
 */
export interface Meta {
  requestId?: string;
  pagination?: { nextCursor: string | null; hasMore: boolean };
  [key: string]: unknown;
}

export function sendSuccess<T>(res: Response, data: T, status = 200, meta?: Meta): Response {
  return res.status(status).json({
    success: true,
    // Media URLs are stored whole at upload time, so a photo uploaded while the
    // API was on localhost keeps that address forever. Rewritten here to the
    // host we are actually serving from — one choke point, every endpoint, no
    // migration, and nothing stored is changed.
    data: normaliseMediaUrls(data),
    meta: { requestId: res.locals.requestId, ...meta },
  });
}

export function sendCreated<T>(res: Response, data: T, meta?: Meta): Response {
  return sendSuccess(res, data, 201, meta);
}

export function sendNoContent(res: Response): Response {
  return res.status(204).send();
}
