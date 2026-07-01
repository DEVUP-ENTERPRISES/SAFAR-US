import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../../core/errors/app-error';

/**
 * RBAC guard factory. Fails closed: any missing permission → 403.
 * Ownership/tenant-scoped checks are delegated to per-module policies
 * inside the service layer once the resource is loaded.
 */
export function authorize(...required: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.principal) return next(new UnauthorizedError());

    const perms = new Set(req.principal.permissions);
    if (perms.has('*')) return next();

    const ok = required.every((p) => perms.has(p));
    if (!ok) return next(new ForbiddenError());
    next();
  };
}
