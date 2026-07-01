import type { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../../core/errors/app-error';
import { tokenService } from '../../modules/auth/application/token.service';
import { sessionStore } from '../../modules/auth/infrastructure/session.store';

/**
 * Verifies the bearer access token AND checks the session is still live in
 * Redis. This hybrid model gives stateless-fast verification with the
 * ability to revoke a token instantly (logout/ban) despite its JWT validity.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  void (async () => {
    try {
      const header = req.header('authorization');
      if (!header?.startsWith('Bearer ')) {
        throw new UnauthorizedError('Missing bearer token');
      }
      const claims = tokenService.verifyAccess(header.slice(7));

      const live = await sessionStore.isActive(claims.sid);
      if (!live) throw new UnauthorizedError('Session expired or revoked');

      req.principal = {
        userId: claims.sub,
        sessionId: claims.sid,
        roles: claims.roles ?? [],
        permissions: claims.permissions ?? [],
      };
      next();
    } catch (err) {
      next(err);
    }
  })();
}
