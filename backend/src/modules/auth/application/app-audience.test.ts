import type { Request } from 'express';
import { assertAppAudience, gateSession, mobileAppOf, webPortalOf } from './app-audience';
import { UserModel } from '../../users/infrastructure/user.model';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { AssetPartnerModel } from '../../asset-partners/infrastructure/asset-partner.model';
import { MemberModel } from '../../corporate/infrastructure/corporate.models';
import { HostStaffModel } from '../../hosts/infrastructure/host-staff.model';
import { tokenService } from './token.service';
import { authService } from './auth.service';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

const req = (headers: Record<string, string>) =>
  ({ get: (h: string) => headers[h.toLowerCase()] }) as unknown as Request;

describe('mobileAppOf', () => {
  it('reads the app only from mobile clients', () => {
    expect(mobileAppOf(req({ 'x-client-type': 'mobile', 'x-app': 'partner' }))).toBe('partner');
    expect(mobileAppOf(req({ 'x-app': 'partner' }))).toBeUndefined();
    expect(mobileAppOf(req({ 'x-client-type': 'mobile', 'x-app': 'other' }))).toBeUndefined();
  });
});

describe('assertAppAudience', () => {
  it('never affects the websites', async () => {
    await expect(assertAppAudience(undefined, { id: 'u1', roles: ['admin'] })).resolves.toBeUndefined();
  });

  it('turns staff away from both apps', async () => {
    await expect(assertAppAudience('customer', { id: 'u1', roles: ['guest', 'support'] })).rejects.toMatchObject({ code: 'APP_STAFF_ACCOUNT' });
  });

  it('lets any guest into the customer app', async () => {
    await expect(assertAppAudience('customer', { id: 'u1', roles: ['guest'] })).resolves.toBeUndefined();
  });

  it('keeps guests out of the partner app', async () => {
    await expect(assertAppAudience('partner', { id: 'u1', roles: ['guest'] })).rejects.toMatchObject({ code: 'APP_NOT_PARTNER', httpStatus: 403 });
  });

  it('lets hosts, asset partners and corporate managers into the partner app', async () => {
    await expect(assertAppAudience('partner', { id: 'h', roles: ['host'] })).resolves.toBeUndefined();
    await HostModel.collection.insertOne({ _id: 'host-1', userId: 'h2' } as never);
    await expect(assertAppAudience('partner', { id: 'h2', roles: ['guest'] })).resolves.toBeUndefined();
    await AssetPartnerModel.collection.insertOne({ _id: 'ap-1', userId: 'ap' } as never);
    await expect(assertAppAudience('partner', { id: 'ap', roles: ['guest'] })).resolves.toBeUndefined();
    await MemberModel.collection.insertOne({ _id: 'm1', orgId: 'o1', userId: 'mgr', email: 'm@x.co', role: 'manager', status: 'active' } as never);
    await expect(assertAppAudience('partner', { id: 'mgr', roles: ['guest'] })).resolves.toBeUndefined();
  });

  it('lets an active captain in, but not an invited or suspended one', async () => {
    await HostStaffModel.collection.insertMany([
      { _id: 's1', hostId: 'h1', email: 'cap@x.co', userId: 'cap', status: 'active' },
      { _id: 's2', hostId: 'h1', email: 'inv@x.co', userId: 'inv', status: 'invited' },
    ] as never[]);
    await expect(assertAppAudience('partner', { id: 'cap', roles: ['guest'] })).resolves.toBeUndefined();
    await expect(assertAppAudience('partner', { id: 'inv', roles: ['guest'] })).rejects.toMatchObject({ code: 'APP_NOT_PARTNER' });
  });

  it('does not count a corporate employee as a partner', async () => {
    await MemberModel.collection.insertOne({ _id: 'm2', orgId: 'o1', userId: 'emp', email: 'e@x.co', role: 'employee', status: 'active' } as never);
    await expect(assertAppAudience('partner', { id: 'emp', roles: ['guest'] })).rejects.toMatchObject({ code: 'APP_NOT_PARTNER' });
  });
});

describe('gateSession', () => {
  it('revokes the session it refuses', async () => {
    jest.spyOn(tokenService, 'verifyAccess').mockReturnValue({ sid: 'sess-1' } as never);
    const logout = jest.spyOn(authService, 'logout').mockResolvedValue();
    const result = { user: { id: 'u1', roles: ['guest'] }, tokens: { accessToken: 'a', refreshToken: 'r' } };
    await expect(gateSession(req({ 'x-client-type': 'mobile', 'x-app': 'partner' }), result)).rejects.toMatchObject({ code: 'APP_NOT_PARTNER' });
    expect(logout).toHaveBeenCalledWith('sess-1');
  });

  it('passes an MFA challenge through untouched', async () => {
    const challenge = { mfaRequired: true };
    await expect(gateSession(req({ 'x-client-type': 'mobile', 'x-app': 'partner' }), challenge)).resolves.toBe(challenge);
  });
});

describe('operations panel audience', () => {
  const seedFleet = async () => {
    await UserModel.collection.insertMany([
      { _id: 'fleet', email: 'fleet@x.co', roles: ['host', 'house_fleet'] },
      { _id: 'owner', email: 'owner@x.co', roles: ['host'] },
    ] as never[]);
    await HostModel.collection.insertMany([
      { _id: 'h-fleet', userId: 'fleet', displayName: 'House Fleet' },
      { _id: 'h-other', userId: 'owner', displayName: 'Other host' },
    ] as never[]);
    await HostStaffModel.collection.insertMany([
      { _id: 's-fleet', hostId: 'h-fleet', email: 'cap@x.co', userId: 'fleet-cap', status: 'active' },
      { _id: 's-gone', hostId: 'h-fleet', email: 'old@x.co', userId: 'old-cap', status: 'suspended' },
      { _id: 's-other', hostId: 'h-other', email: 'oc@x.co', userId: 'other-cap', status: 'active' },
    ] as never[]);
  };

  it('lets the House Fleet account and its active captains in', async () => {
    await seedFleet();
    await expect(assertAppAudience(undefined, { id: 'fleet', roles: ['host', 'house_fleet'] }, 'ioc')).resolves.toBeUndefined();
    await expect(assertAppAudience(undefined, { id: 'fleet-cap', roles: ['guest'] }, 'ioc')).resolves.toBeUndefined();
  });

  it('keeps out other hosts, their captains, suspended captains, guests and staff', async () => {
    await seedFleet();
    for (const u of [
      { id: 'owner', roles: ['host'] },
      { id: 'other-cap', roles: ['guest'] },
      { id: 'old-cap', roles: ['guest'] },
      { id: 'g', roles: ['guest'] },
      { id: 'adm', roles: ['admin'] },
    ]) {
      await expect(assertAppAudience(undefined, u, 'ioc')).rejects.toMatchObject({ code: 'IOC_NOT_OPERATOR' });
    }
  });

  it('only applies when the panel names itself', async () => {
    expect(webPortalOf(req({ 'x-portal': 'ioc' }))).toBe('ioc');
    expect(webPortalOf(req({}))).toBeUndefined();
    await expect(assertAppAudience(undefined, { id: 'g', roles: ['guest'] })).resolves.toBeUndefined();
  });

  it('revokes a refused panel session', async () => {
    jest.spyOn(tokenService, 'verifyAccess').mockReturnValue({ sid: 'sess-2' } as never);
    const logout = jest.spyOn(authService, 'logout').mockResolvedValue();
    const result = { user: { id: 'g', roles: ['guest'] }, tokens: { accessToken: 'a', refreshToken: 'r' } };
    await expect(gateSession(req({ 'x-portal': 'ioc' }), result)).rejects.toMatchObject({ code: 'IOC_NOT_OPERATOR' });
    expect(logout).toHaveBeenCalledWith('sess-2');
  });
});
