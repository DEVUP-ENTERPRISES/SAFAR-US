import type { Request, Response, NextFunction } from 'express';

/**
 * Defence in depth against Mongo operator injection: a body, query or param
 * carrying keys like `$ne` or `$where` (or dotted paths) can rewrite a filter on
 * any route that forgets to validate its input. Validated routes already strip
 * unknown fields; this removes the dangerous keys everywhere else, before any
 * handler sees them.
 */
const isUnsafeKey = (k: string): boolean => k.startsWith('$') || k.includes('.');

export function stripUnsafeKeys(value: unknown, depth = 0): unknown {
  if (depth > 12 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => stripUnsafeKeys(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!isUnsafeKey(k)) out[k] = stripUnsafeKeys(v, depth + 1);
  }
  return out;
}

export function sanitizeRequest(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) req.body = stripUnsafeKeys(req.body);
  if (req.query) Object.assign(req.query, stripUnsafeKeys({ ...req.query }));
  next();
}
