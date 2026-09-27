const sent: { title: string; body: string }[] = [];
jest.mock('../../notifications/infrastructure/channel.providers', () => ({
  channelProviders: { email: { send: async (m: { title: string; body: string }) => void sent.push(m) }, sms: { send: async (m: { title: string; body: string }) => void sent.push(m) } },
}));

import { contactVerificationService } from './contact-verification.service';
import { userService } from './user.service';
import { UserModel } from '../infrastructure/user.model';
import { setKvStore, InMemoryKvStore } from '../../../infrastructure/cache/kv-store';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => { await clearTestDb(); setKvStore(new InMemoryKvStore()); sent.length = 0; });

const codeFrom = () => sent[sent.length - 1].body.match(/\d{6}/)![0];

describe('confirming the email and mobile number on an account', () => {
  it('confirms the phone with the code sent to it, and refuses a wrong one', async () => {
    const u = await UserModel.create({ email: 'g@x.com', phone: '+12145550100', roles: ['guest'] });
    await contactVerificationService.send(u._id, 'phone');
    await expect(contactVerificationService.confirm(u._id, 'phone', codeFrom() === '000000' ? '111111' : '000000')).rejects.toThrow();
    await contactVerificationService.send(u._id, 'phone');
    await contactVerificationService.confirm(u._id, 'phone', codeFrom());
    expect((await UserModel.findById(u._id).lean())!.phoneVerified).toBe(true);
  });

  it('a new phone number must be confirmed again', async () => {
    const u = await UserModel.create({ email: 'h@x.com', phone: '+12145550100', phoneVerified: true, roles: ['guest'] });
    await userService.updateProfile(u._id, { phone: '+12145550199' });
    expect((await UserModel.findById(u._id).lean())!.phoneVerified).toBe(false);
  });

  it('refuses when already confirmed', async () => {
    const u = await UserModel.create({ email: 'i@x.com', emailVerified: true, roles: ['guest'] });
    await expect(contactVerificationService.send(u._id, 'email')).rejects.toMatchObject({ code: 'ALREADY_VERIFIED' });
  });
});
