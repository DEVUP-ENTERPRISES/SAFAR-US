import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../../core/errors/app-error';
import { userRepository } from '../../modules/users/infrastructure/user.repository';
import { HOUSE_FLEET_ROLE, IOC_PERMISSIONS, STAFF_ROLES } from '../constants/rbac';
import { logger } from '../../infrastructure/logging/logger';

/** The operations panel's gate: the House Fleet account itself, re-read from the database on every request. */
export function requireFleetOwner(req: Request, _res: Response, next: NextFunction): void {
  void (async () => {
    try {
      const principal = req.principal;
      if (!principal) throw new UnauthorizedError();
      const user = await userRepository.findById(principal.userId);
      if (!user) throw new UnauthorizedError('Account not found');
      if (user.status !== 'active') throw new ForbiddenError('Account is not active');
      const roles = user.roles ?? [];
      if (!roles.includes(HOUSE_FLEET_ROLE) || roles.some((r) => STAFF_ROLES.includes(r))) {
        logger.warn({ userId: user._id }, 'operations panel access denied');
        throw new NotFoundError('Resource');
      }
      // Scoped to the routes mounted behind this gate, which are only Asset Partner management.
      principal.roles = roles;
      principal.permissions = [...IOC_PERMISSIONS];
      next();
    } catch (err) {
      next(err);
    }
  })();
}
