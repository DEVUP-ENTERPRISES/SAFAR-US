import type { Request, Response, NextFunction } from 'express';
import { auditService } from '../../modules/audit/application/audit.service';

/**
 * Records every successful privileged mutation (non-GET) after the response
 * finishes. Applied on the admin router so the whole back-office surface is
 * audited generically — no per-route wiring.
 */
export function auditLog(resourceTypeHint?: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'GET') return next();
    res.on('finish', () => {
      if (res.statusCode >= 400 || !req.principal) return;
      void auditService.record({
        actorId: req.principal.userId,
        actorRoles: req.principal.roles,
        action: `${req.method} ${req.baseUrl}${req.route?.path ?? req.path}`,
        resourceType: resourceTypeHint,
        resourceId: (req.params as Record<string, string>).id,
        ip: req.ip,
        status: res.statusCode,
        correlationId: res.locals.requestId as string,
      });
    });
    next();
  };
}
