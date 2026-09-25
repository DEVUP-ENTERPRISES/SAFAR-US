/**
 * A Captain invite must never be a way into someone else's account: the token is
 * a secret for the invitee only, and it can never sign anyone into an account
 * that already exists.
 */
jest.mock('../../notifications/infrastructure/channel.providers', () => ({
  channelProviders: { email: { send: jest.fn().mockResolvedValue({ ok: true }) } },
}));

import { hostStaffService } from './host-staff.service';
import { HostStaffModel } from '../infrastructure/host-staff.model';
import { HostModel } from '../infrastructure/host.model';
import { userRepository } from '../../users/infrastructure/user.repository';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

async function seedHost() {
  const owner = await userRepository.create({ email: 'host@x.com', passwordHash: 'x', firstName: 'H' } as never);
  await HostModel.collection.insertOne({ _id: 'host-1', userId: owner._id, displayName: 'Fleet', deletedAt: null } as never);
  return owner;
}

describe('captain invites', () => {
  it('never returns the invite token to the host who sent it', async () => {
    const owner = await seedHost();

    const created = await hostStaffService.invite(owner._id, { name: 'Sam', email: 'sam@x.com' });
    const listed = await hostStaffService.list(owner._id);

    expect(JSON.stringify(created)).not.toContain('inviteToken');
    expect(JSON.stringify(listed)).not.toContain('inviteToken');
    expect((await HostStaffModel.findOne({ email: 'sam@x.com' }).lean())?.inviteToken).toBeTruthy(); // it still exists for the email
  });

  it('refuses to link an EXISTING account unless that account is the one signed in', async () => {
    const owner = await seedHost();
    const victim = await userRepository.create({ email: 'victim@x.com', passwordHash: 'x', firstName: 'V' } as never);
    await hostStaffService.invite(owner._id, { name: 'V', email: 'victim@x.com' });
    const token = (await HostStaffModel.findOne({ email: 'victim@x.com' }).lean())!.inviteToken!;

    await expect(hostStaffService.acceptInvite(token)).rejects.toMatchObject({ code: 'SIGN_IN_REQUIRED' });
    await expect(hostStaffService.acceptInvite(token, undefined, 'someone-else')).rejects.toMatchObject({ code: 'SIGN_IN_REQUIRED' });

    const ok = await hostStaffService.acceptInvite(token, undefined, victim._id);
    expect(ok).toEqual({ userId: victim._id, created: false });
  });

  it('creates a new account only when there is none, and only with a password', async () => {
    const owner = await seedHost();
    await hostStaffService.invite(owner._id, { name: 'New', email: 'new@x.com' });
    const token = (await HostStaffModel.findOne({ email: 'new@x.com' }).lean())!.inviteToken!;

    await expect(hostStaffService.acceptInvite(token)).rejects.toBeDefined();
    const r = await hostStaffService.acceptInvite(token, 'a-long-password');
    expect(r.created).toBe(true);
  });

  it('a token works once', async () => {
    const owner = await seedHost();
    await hostStaffService.invite(owner._id, { name: 'New', email: 'new@x.com' });
    const token = (await HostStaffModel.findOne({ email: 'new@x.com' }).lean())!.inviteToken!;
    await hostStaffService.acceptInvite(token, 'a-long-password');

    await expect(hostStaffService.acceptInvite(token, 'a-long-password')).rejects.toBeDefined();
  });
});
