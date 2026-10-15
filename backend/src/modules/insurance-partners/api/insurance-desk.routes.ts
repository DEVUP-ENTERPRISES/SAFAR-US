import { Router, type Request } from 'express';
import { z } from 'zod';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { requireAdmin } from '../../../shared/middleware/require-admin';
import { requireMfa } from '../../../shared/middleware/require-mfa';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';
import { ForbiddenError } from '../../../core/errors/app-error';
import { config } from '../../../config';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { insurancePartnerAdminRoutes } from './insurance-partner.admin.routes';
import { insuranceAdminRoutes } from '../../insurance/api/insurance.admin.routes';

const holds = (req: Request, permission: string) => {
  const perms = req.principal?.permissions ?? [];
  return perms.includes('*') || perms.includes(permission);
};

const settingsBody = z.object({
  reason: z.string().max(300).optional(),
  wheelbaseDealerId: z.string().trim().regex(/^\d{0,20}$/, 'Digits only').optional(),
  requireApproved: z.boolean().optional(),
  enforceMinAge: z.boolean().optional(),
  partnerCommissionBps: z.number().int().min(0).max(5000).optional(),
});

// Insurance desk API: separate from admin; insurance staff hold no admin:read.
export function buildInsuranceDeskRouter(): Router {
  const desk = Router();
  desk.use(authenticate, requireAdmin, ...(config.insuranceDesk.requireMfa ? [requireMfa] : []), authorize('insurance:read'));

  desk.get(
    '/settings',
    asyncHandler(async (_req, res) => {
      sendSuccess(res, (await platformConfigService.get()).insurance);
    }),
  );

  // Each field needs its own permission: the default commission is a money rule, kept to admins.
  desk.put(
    '/settings',
    validate({ body: settingsBody }),
    asyncHandler(async (req, res) => {
      const { reason, ...insurance } = req.body as z.infer<typeof settingsBody>;
      if (insurance.partnerCommissionBps !== undefined && !holds(req, 'insurance:commission')) throw new ForbiddenError('Changing the commission needs an admin');
      const coverFields = ['wheelbaseDealerId', 'requireApproved', 'enforceMinAge'] as const;
      if (coverFields.some((k) => insurance[k] !== undefined) && !holds(req, 'insurance:manage')) throw new ForbiddenError();
      const updated = await platformConfigService.update({ insurance }, req.principal!.userId, reason);
      sendSuccess(res, updated.insurance);
    }),
  );

  desk.use(insurancePartnerAdminRoutes);
  desk.use(insuranceAdminRoutes);
  return desk;
}
