import type { Request } from 'express';
import { AppError } from '../../../core/errors/app-error';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { AssetPartnerModel } from '../../asset-partners/infrastructure/asset-partner.model';
import { MemberModel } from '../../corporate/infrastructure/corporate.models';
import { HostStaffModel } from '../../hosts/infrastructure/host-staff.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { ROLES, STAFF_ROLES } from '../../../shared/constants/rbac';
import { tokenService } from './token.service';
import { authService } from './auth.service';

export type MobileApp = 'customer' | 'partner';

/** Which mobile app sent the request; undefined for the websites. */
export function mobileAppOf(req: Request): MobileApp | undefined {
  if (req.get('x-client-type') !== 'mobile') return undefined;
  const app = req.get('x-app');
  return app === 'customer' || app === 'partner' ? app : undefined;
}

/** The website a sign-in came from, when it is one with its own audience. */
export function webPortalOf(req: Request): 'ioc' | undefined {
  return req.get('x-portal') === 'ioc' ? 'ioc' : undefined;
}

/** The House Fleet account, or an active captain on its team, runs CatoDrive's operations panel. */
async function isFleetOperator(userId: string, roles: string[]): Promise<boolean> {
  if (roles.includes('house_fleet')) return true;
  const hostIds = await HostStaffModel.find({ userId, status: 'active' }).distinct('hostId');
  if (hostIds.length === 0) return false;
  const ownerIds = await HostModel.find({ _id: { $in: hostIds } }).distinct('userId');
  return !!(await UserModel.exists({ _id: { $in: ownerIds }, roles: 'house_fleet' }));
}

/** Hosts, their active captains, asset partners and corporate admins or managers run the partner app. */
async function isPartner(userId: string, roles: string[]): Promise<boolean> {
  if (roles.includes(ROLES.HOST)) return true;
  const [host, staff, partner, corp] = await Promise.all([
    HostModel.exists({ userId }),
    HostStaffModel.exists({ userId, status: 'active' }),
    AssetPartnerModel.exists({ userId }),
    MemberModel.exists({ userId, status: 'active', role: { $in: ['corp_admin', 'manager'] } }),
  ]);
  return !!(host || staff || partner || corp);
}

/** Refuses a sign-in the app or panel it came from is not for. Other websites are never affected. */
export async function assertAppAudience(app: MobileApp | undefined, user: { id: string; roles: string[] }, portal?: 'ioc'): Promise<void> {
  if (portal === 'ioc' && (user.roles.some((r) => STAFF_ROLES.includes(r)) || !(await isFleetOperator(user.id, user.roles)))) {
    throw new AppError({ code: 'IOC_NOT_OPERATOR', message: 'This panel is for CatoDrive operations accounts only.', httpStatus: 403 });
  }
  if (!app) return;
  if (user.roles.some((r) => STAFF_ROLES.includes(r))) {
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
    await assertAppAudience(mobileAppOf(req), r.user, webPortalOf(req));
  } catch (err) {
    const { sid } = tokenService.verifyAccess(r.tokens.accessToken);
    await authService.logout(sid);
    throw err;
  }
  return result;
}
