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

/**
 * Attach the caller if they are signed in, but never reject them.
 *
 * For endpoints that are strictly better with a user yet must work without one
 * — a price quote being the obvious case. Requiring a login just to see a
 * price is a conversion tax, and the pricing service already handles an absent
 * guest (it prices normally and simply issues no price lock, since a lock is
 * bound to a person).
 *
 * A malformed or expired token is treated as "not signed in" rather than an
 * error: the caller asked for something public, and failing them over a stale
 * token would be worse than serving the anonymous answer.
 */
export function authenticateOptional(req: Request, _res: Response, next: NextFunction): void {
  void (async () => {
    try {
      const header = req.header('authorization');
      if (!header?.startsWith('Bearer ')) return next();

      const claims = tokenService.verifyAccess(header.slice(7));
      if (await sessionStore.isActive(claims.sid)) {
        req.principal = {
          userId: claims.sub,
          sessionId: claims.sid,
          roles: claims.roles ?? [],
          permissions: claims.permissions ?? [],
        };
      }
    } catch {
      // Anonymous is a valid outcome here.
    }
    next();
  })();
}
