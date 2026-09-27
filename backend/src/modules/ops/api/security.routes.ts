import { Router } from 'express';
import { RequestFailureModel } from '../infrastructure/request-failure.model';
import { lookupLimiter } from '../../../shared/middleware/auth-rate-limit';
import { logger } from '../../../infrastructure/logging/logger';

const router = Router();

/**
 * Content security policy violation reports from browsers. A violation is either an attack being
 * blocked (an injected script, a skimmer) or an origin the site legitimately needs that the policy
 * is missing; both belong in front of ops, so they land in Failed Attempts under "security".
 */
router.post('/csp-report', lookupLimiter, (req, res) => {
  try {
    const body = req.body as Record<string, unknown> | Record<string, unknown>[] | undefined;
    const raw = Array.isArray(body) ? (body[0]?.body as Record<string, unknown>) : ((body?.['csp-report'] as Record<string, unknown>) ?? body);
    const pick = (k: string, alt: string) => String(raw?.[k] ?? raw?.[alt] ?? '').slice(0, 300);
    const blocked = pick('blocked-uri', 'blockedURL');
    const directive = pick('violated-directive', 'effectiveDirective');
    const page = pick('document-uri', 'documentURL').replace(/\?.*$/, '');
    if (directive) {
      void RequestFailureModel.create({
        area: 'security', method: 'CSP', path: page, status: 0, code: 'CSP_VIOLATION',
        message: `${directive} blocked ${blocked || 'inline'}`, userAgent: req.header('user-agent')?.slice(0, 200), country: req.header('cf-ipcountry') ?? undefined,
      }).catch((err) => logger.warn({ err: (err as Error).message }, 'csp report not stored'));
    }
  } catch {
    /* a malformed report is ignored */
  }
  res.status(204).end();
});

export const securityRoutes = router;
