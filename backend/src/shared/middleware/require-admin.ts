import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../../core/errors/app-error';
import { userRepository } from '../../modules/users/infrastructure/user.repository';
import { permissionsForRoles, ROLES } from '../constants/rbac';
import { config } from '../../config';
import { logger } from '../../infrastructure/logging/logger';

/**
 * The admin gate — authorization proven against the database, per request.
 *
 * `authorize()` reads roles and permissions out of the JWT, which is fine for
 * ordinary user actions: the token is signed, so a client cannot forge them.
 * But it is the token's word, frozen at login. For the back office that is not
 * good enough, for two reasons this middleware closes:
 *
 *  1. A revoked or demoted admin keeps every admin power until their access
 *     token expires — up to the full TTL — because nothing re-checks the DB.
 *     Banning an admin should lock them out of the panel THIS request, not in
 *     fifteen minutes.
 *
 *  2. "Never trust the role in the JWT payload alone." The requirement is
 *     explicit, and the only way to honour it is to read the live record and
 *     recompute from it.
 *
 * So this loads the caller fresh, verifies the account is still active and
 * still privileged IN THE DATABASE, and then OVERWRITES req.principal's roles
 * and permissions with what the database says. Every downstream authorize()
 * on an admin route therefore decides on live truth, not a stale claim.
 *
 * Runs after authenticate (which has already verified the token signature and
 * that the session is live in Redis), so this is one indexed _id read on a
 * low-volume surface — the back office is not a hot path.
 */

/** Roles that may reach the back office at all. Everything else is a customer. */
const STAFF_ROLES = new Set<string>([
  ROLES.SUPER_ADMIN,
  ROLES.SUPPORT,
  ROLES.MODERATOR,
  ROLES.FINANCE,
  ROLES.OPS,
]);

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  void (async () => {
    try {
      const principal = req.principal;
      if (!principal) throw new UnauthorizedError();

      // The database is the authority, not the token.
      const user = await userRepository.findById(principal.userId);
      if (!user) throw new UnauthorizedError('Account not found');

      // Status is re-read too: a token minted while active must not outlive a
      // suspension.
      if (user.status !== 'active') {
        logger.warn({ userId: user._id, status: user.status }, 'admin access blocked — account not active');
        throw new ForbiddenError('Account is not active');
      }

      const liveRoles = user.roles ?? [];
      const isStaff = liveRoles.some((r) => STAFF_ROLES.has(r));
      if (!isStaff) {
        // A customer reaching an admin route is worth recording — it is either
        // a probe or a bug, and neither should pass silently.
        logger.warn({ userId: user._id, roles: liveRoles }, 'admin access denied — no staff role in database');
        throw new ForbiddenError('Admin access required');
      }

      /*
       * Only the .env admin may hold super_admin.
       *
       * super_admin carries the '*' permission — total control — and the rule
       * is that exactly one account has it, the one provisioned from the
       * environment. If any OTHER account presents super_admin here, that is a
       * privilege the system never intended to grant: it is refused, logged as
       * a security event, and stripped so the anomaly cannot be used again.
       * enforceSingleSuperAdmin() does the same sweep at boot; this is the
       * per-request backstop for a role that appeared in between.
       */
      const isEnvAdmin =
        config.admin.enabled && !!user.email && user.email.toLowerCase() === config.admin.email!.toLowerCase();
      if (liveRoles.includes(ROLES.SUPER_ADMIN) && !isEnvAdmin) {
        logger.error(
          { userId: user._id, email: user.email },
          'SECURITY: non-env account holds super_admin — refusing and stripping',
        );
        await userRepository.pullRoles(user._id, [ROLES.SUPER_ADMIN]);
        throw new ForbiddenError('Admin access required');
      }

      // Decide the rest of the request on database truth, not the stale claim.
      req.principal = {
        ...principal,
        roles: liveRoles,
        permissions: permissionsForRoles(liveRoles),
      };
      next();
    } catch (err) {
      next(err);
    }
  })();
}
