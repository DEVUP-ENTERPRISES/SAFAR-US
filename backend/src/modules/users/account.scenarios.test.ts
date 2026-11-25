import { connectTestDb, clearTestDb, disconnectTestDb } from '../../testing/mongo';
import { startTestApi, tokenFor, type TestApi } from '../../testing/http';
import { seedUser } from '../../testing/fixtures';
import { UserModel } from './infrastructure/user.model';
import { KycModel } from '../kyc/infrastructure/kyc.model';

let api: TestApi;
beforeAll(async () => {
  await connectTestDb();
  api = await startTestApi();
});
afterAll(async () => {
  await api.close();
  await disconnectTestDb();
});
beforeEach(clearTestDb);

describe('a guest editing their own account', () => {
  it('P1 can change their name', async () => {
    const id = await seedUser();
    const r = await api.call<{ firstName: string }>('PATCH', '/users/me', { token: await tokenFor(id), body: { firstName: 'Sam' } });
    expect(r.status).toBe(200);
    expect((await UserModel.findById(id).lean())?.firstName).toBe('Sam');
  });

  it('P2 cannot give themselves admin roles or change their status', async () => {
    const id = await seedUser();
    await api.call('PATCH', '/users/me', { token: await tokenFor(id), body: { roles: ['super_admin'], status: 'active', firstName: 'X' } });
    expect((await UserModel.findById(id).lean())?.roles).toEqual(['guest']);
  });

  it('P3 cannot set an outside image as their photo', async () => {
    const id = await seedUser();
    const r = await api.call('PATCH', '/users/me', { token: await tokenFor(id), body: { avatarUrl: 'https://tracker.example/pixel.png' } });
    expect(r.status).toBe(422);
  });

  it('P4 can set their own uploaded photo', async () => {
    const id = await seedUser();
    const r = await api.call('PATCH', '/users/me', { token: await tokenFor(id), body: { avatarUrl: `https://cdn.test/avatar/2026/11/${id}/me.jpg` } });
    expect(r.status).toBe(200);
  });

  it('P5 keeps an existing photo when saving other fields', async () => {
    const id = await seedUser({ avatarUrl: 'https://lh3.googleusercontent.com/a/photo' });
    const r = await api.call('PATCH', '/users/me', { token: await tokenFor(id), body: { avatarUrl: 'https://lh3.googleusercontent.com/a/photo', firstName: 'Lee' } });
    expect(r.status).toBe(200);
  });

  it('P6 cannot enter an under-age date of birth', async () => {
    const id = await seedUser();
    const r = await api.call('PATCH', '/users/me', { token: await tokenFor(id), body: { dateOfBirth: new Date(Date.now() - 15 * 365 * 86_400_000).toISOString().slice(0, 10) } });
    expect(r.status).toBe(422);
  });

  it('P7 cannot enter a date of birth that is not a date', async () => {
    const id = await seedUser();
    expect((await api.call('PATCH', '/users/me', { token: await tokenFor(id), body: { dateOfBirth: 'yesterday' } })).status).toBe(422);
  });

  it('P8 cannot change their date of birth after their ID confirmed it', async () => {
    const id = await seedUser({ dateOfBirth: '2003-05-01' });
    await KycModel.create({ userId: id, status: 'approved', verifiedDob: new Date('2003-05-01') });
    const r = await api.call('PATCH', '/users/me', { token: await tokenFor(id), body: { dateOfBirth: '1990-05-01' } });
    expect(r.status).toBe(409);
    expect((await UserModel.findById(id).lean())?.dateOfBirth).toBe('2003-05-01');
  });

  it('P9 changing the phone number clears its verified flag', async () => {
    const id = await seedUser({ phone: '+12145550100', phoneVerified: true });
    await api.call('PATCH', '/users/me', { token: await tokenFor(id), body: { phone: '+12145550199' } });
    expect((await UserModel.findById(id).lean())?.phoneVerified).toBe(false);
  });

  it('P10 signed out cannot edit anything', async () => {
    expect((await api.call('PATCH', '/users/me', { body: { firstName: 'X' } })).status).toBe(401);
  });

  it('P11 a banned guest is signed out', async () => {
    const id = await seedUser();
    const tok = await tokenFor(id);
    await UserModel.updateOne({ _id: id }, { status: 'banned' });
    expect((await api.call('PATCH', '/users/me', { token: tok, body: { firstName: 'X' } })).status).toBe(401);
  });
});
