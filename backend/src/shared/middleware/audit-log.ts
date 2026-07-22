import type { Request, Response, NextFunction } from 'express';
import { auditService } from '../../modules/audit/application/audit.service';

/**
 * Records every successful privileged mutation (non-GET) after the response
 * finishes. Applied on the admin router so the whole back-office surface is
 * audited generically — no per-route wiring.
 */
/**
 * Never write a secret into an append-only store.
 *
 * The audit log is deliberately impossible to edit or delete, which means a
 * password or card number landing in it cannot be removed later — the whole
 * collection would have to be destroyed, taking the audit trail with it.
 */
const SENSITIVE = /password|secret|token|cvv|cvc|pan|cardNumber|ssn|taxId|accountNumber|mfa/i;

function redact(value: unknown, depth = 0): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || depth > 4) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE.test(k)) out[k] = '[redacted]';
    else if (v && typeof v === 'object') out[k] = redact(v, depth + 1) ?? '[object]';
    else out[k] = v;
  }
  return out;
}

/**
 * Capture the state of a document BEFORE a handler mutates it, so the audit
 * line can show what changed rather than only what was sent.
 */
export function auditBefore(res: { locals: Record<string, unknown> }, snapshot: unknown): void {
  res.locals.auditBefore = redact(snapshot);
}

/** The first identifier-looking route param, whatever it is called. */
function resourceIdFrom(params: Record<string, string>): string | undefined {
  const preferred = ['id', 'userId', 'bookingId', 'vehicleId', 'eventId', 'hostId', 'claimId'];
  for (const key of preferred) if (params[key]) return params[key];
  const [first] = Object.values(params);
  return first;
}

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
        // Routes name their parameter differently (:id, :userId, :bookingId).
        // Reading only `id` left every one of those entries unattributed —
        // present in the log, but impossible to find by subject.
        resourceId: resourceIdFrom(req.params as Record<string, string>),
        ip: req.ip,
        userAgent: req.device?.userAgent,
        // The request body IS the "after" for a mutation, minus anything that
        // must never reach an audit store.
        after: redact(req.body),
        before: res.locals.auditBefore as Record<string, unknown> | undefined,
        reason: (req.body as { reason?: string } | undefined)?.reason,
        status: res.statusCode,
        correlationId: res.locals.requestId as string,
      });
    });
    next();
  };
}
