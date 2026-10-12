import type { Request } from 'express';
import { AppError } from '../../../core/errors/app-error';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { AssetPartnerModel } from '../../asset-partners/infrastructure/asset-partner.model';
import { MemberModel } from '../../corporate/infrastructure/corporate.models';
import { ROLES } from '../../../shared/constants/rbac';
import { tokenService } from './token.service';
import { authService } from './auth.service';

export type MobileApp = 'customer' | 'partner';

const STAFF = [ROLES.SUPPORT, ROLES.MODERATOR, ROLES.FINANCE, ROLES.OPS, ROLES.ADMIN, ROLES.SUPER_ADMIN] as string[];

/** Which mobile app sent the request; undefined for the websites. */
export function mobileAppOf(req: Request): MobileApp | undefined {
  if (req.get('x-client-type') !== 'mobile') return undefined;
  const app = req.get('x-app');
  return app === 'customer' || app === 'partner' ? app : undefined;
}

/** Hosts, asset partners and corporate admins or managers run the partner app. */
async function isPartner(userId: string, roles: string[]): Promise<boolean> {
  if (roles.includes(ROLES.HOST)) return true;
  const [host, partner, corp] = await Promise.all([
    HostModel.exists({ userId }),
    AssetPartnerModel.exists({ userId }),
    MemberModel.exists({ userId, status: 'active', role: { $in: ['corp_admin', 'manager'] } }),
  ]);
  return !!(host || partner || corp);
}

/** Refuses a sign-in the app it came from is not for. Websites are never affected. */
export async function assertAppAudience(app: MobileApp | undefined, user: { id: string; roles: string[] }): Promise<void> {
  if (!app) return;
  if (user.roles.some((r) => STAFF.includes(r))) {
    throw new AppError({ code: 'APP_STAFF_ACCOUNT', message: 'Staff accounts sign in on the CatoDrive admin website, not the app.', httpStatus: 403 });
  }
  if (app === 'partner' && !(await isPartner(user.id, user.roles))) {
    throw new AppError({
      code: 'APP_NOT_PARTNER',
      message: 'This app is for CatoDrive hosts and partners. To rent a car, use the CatoDrive app.',
      httpStatus: 403,
    });
  }
}

/** Gates a freshly issued session; a refused one is revoked before the error goes back. */
export async function gateSession<T>(req: Request, result: T): Promise<T> {
  const r = result as { user?: { id: string; roles: string[] }; tokens?: { accessToken: string } };
  if (!r.user || !r.tokens) return result;
  try {
    await assertAppAudience(mobileAppOf(req), r.user);
  } catch (err) {
    const { sid } = tokenService.verifyAccess(r.tokens.accessToken);
    await authService.logout(sid);
    throw err;
  }
  return result;
}
