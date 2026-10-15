import type { Request, Response, NextFunction } from 'express';
import { AppError, UnauthorizedError } from '../../core/errors/app-error';
import { userRepository } from '../../modules/users/infrastructure/user.repository';

// Read live per request, so switching 2FA off locks the account out at once.
export function requireMfa(req: Request, _res: Response, next: NextFunction): void {
  void (async () => {
    try {
      if (!req.principal) throw new UnauthorizedError();
      const user = await userRepository.findById(req.principal.userId);
      if (!user?.mfa?.enabled) {
        throw new AppError({ code: 'MFA_SETUP_REQUIRED', message: 'Turn on two-step sign-in to use this panel.', httpStatus: 403 });
      }
      next();
    } catch (err) {
      next(err);
    }
  })();
}
