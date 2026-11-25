jest.mock('../payments/infrastructure/gateway.provider', () => ({ paymentGateway: new (jest.requireActual('../payments/infrastructure/mock.gateway').MockGateway)() }));

import { connectTestDb, clearTestDb, disconnectTestDb } from '../../testing/mongo';
import { startTestApi, tokenFor, type TestApi } from '../../testing/http';
import { seedUser, seedHost, seedVehicle, seedBooking } from '../../testing/fixtures';
import { MessageModel } from './infrastructure/message.model';
import { InquiryMessageModel } from './infrastructure/inquiry-message.model';
import { UserModel } from '../users/infrastructure/user.model';

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

async function world() {
  const guestId = await seedUser();
  const host = await seedHost();
  const vehicleId = await seedVehicle(host.hostId);
  const bookingId = await seedBooking(guestId, host.hostId, vehicleId);
  return { guestId, host, vehicleId, bookingId, guest: await tokenFor(guestId), hostTok: await tokenFor(host.userId, ['guest', 'host']) };
}
const ownPhoto = (userId: string) => `message/2026/11/${userId}/aaaa.jpg`;

describe('booking chat, from the guest side', () => {
  it('M1 guest and host can message each other on their booking', async () => {
    const w = await world();
    expect((await api.call('POST', `/messages/${w.bookingId}`, { token: w.guest, body: { body: 'Hi, can I pick up at 9?' } })).status).toBe(201);
    expect((await api.call('POST', `/messages/${w.bookingId}`, { token: w.hostTok, body: { body: 'Sure' } })).status).toBe(201);
    const list = await api.call<{ body: string }[]>('GET', `/messages/${w.bookingId}`, { token: w.guest });
    expect(list.body.data?.map((m) => m.body)).toEqual(['Hi, can I pick up at 9?', 'Sure']);
  });

  it('M2 a stranger cannot read or write someone else’s chat', async () => {
    const w = await world();
    const other = await tokenFor(await seedUser());
    expect((await api.call('GET', `/messages/${w.bookingId}`, { token: other })).status).toBe(403);
    expect((await api.call('POST', `/messages/${w.bookingId}`, { token: other, body: { body: 'hey' } })).status).toBe(403);
  });

  it('M3 signed-out callers are refused', async () => {
    const w = await world();
    expect((await api.call('GET', `/messages/${w.bookingId}`)).status).toBe(401);
  });

  it('M4 an empty message is refused', async () => {
    const w = await world();
    expect((await api.call('POST', `/messages/${w.bookingId}`, { token: w.guest, body: { body: '   ' } })).status).toBe(422);
  });

  it('M5 a message over 2000 characters is refused', async () => {
    const w = await world();
    expect((await api.call('POST', `/messages/${w.bookingId}`, { token: w.guest, body: { body: 'x'.repeat(2001) } })).status).toBe(422);
  });

  it('M6 a javascript: link cannot be sent as an attachment', async () => {
    const w = await world();
    const r = await api.call('POST', `/messages/${w.bookingId}`, { token: w.guest, body: { body: '', attachments: [{ url: 'javascript:alert(1)', kind: 'file' }] } });
    expect(r.status).toBe(422);
    expect(await MessageModel.countDocuments()).toBe(0);
  });

  it('M7 a photo from an outside site cannot be attached', async () => {
    const w = await world();
    const r = await api.call('POST', `/messages/${w.bookingId}`, { token: w.guest, body: { attachments: [{ url: 'https://evil.example/track.png', kind: 'image' }] } });
    expect(r.status).toBe(422);
  });

  it('M8 someone else’s upload cannot be attached', async () => {
    const w = await world();
    const r = await api.call('POST', `/messages/${w.bookingId}`, { token: w.guest, body: { attachments: [{ url: `https://cdn.test/${ownPhoto(w.host.userId)}`, kind: 'image' }] } });
    expect(r.status).toBe(422);
  });

  it('M9 the guest’s own uploaded photo is attached, stored as our own URL', async () => {
    const w = await world();
    const r = await api.call<{ attachments: { url: string }[] }>('POST', `/messages/${w.bookingId}`, { token: w.guest, body: { attachments: [{ url: `https://anything.test/${ownPhoto(w.guestId)}`, kind: 'image' }] } });
    expect(r.status).toBe(201);
    expect(decodeURIComponent(r.body.data?.attachments[0].url ?? '')).toContain(ownPhoto(w.guestId));
    expect(r.body.data?.attachments[0].url).not.toContain('anything.test');
  });

  it('M10 more than 4 attachments at once is refused', async () => {
    const w = await world();
    const many = Array.from({ length: 5 }, () => ({ url: `https://x.test/${ownPhoto(w.guestId)}`, kind: 'image' }));
    expect((await api.call('POST', `/messages/${w.bookingId}`, { token: w.guest, body: { attachments: many } })).status).toBe(422);
  });

  it('M11 a long chat shows the newest 200 messages, oldest first', async () => {
    const w = await world();
    const t0 = Date.now() - 1_000_000;
    await MessageModel.insertMany(Array.from({ length: 230 }, (_, i) => ({ bookingId: w.bookingId, senderId: w.guestId, body: `m${i}`, readBy: [], createdAt: new Date(t0 + i * 1000) })));
    const list = await api.call<{ body: string }[]>('GET', `/messages/${w.bookingId}`, { token: w.guest });
    expect(list.body.data).toHaveLength(200);
    expect(list.body.data?.[0].body).toBe('m30');
    expect(list.body.data?.[199].body).toBe('m229');
  });

  it('M12 unread count goes up for the other side and clears once read', async () => {
    const w = await world();
    await api.call('POST', `/messages/${w.bookingId}`, { token: w.hostTok, body: { body: 'Car is ready' } });
    expect((await api.call<{ count: number }>('GET', '/messages/unread-count', { token: w.guest })).body.data?.count).toBe(1);
    await api.call('POST', `/messages/${w.bookingId}/read`, { token: w.guest });
    expect((await api.call<{ count: number }>('GET', '/messages/unread-count', { token: w.guest })).body.data?.count).toBe(0);
  });

  it('M13 a suspended guest is signed out of chat', async () => {
    const w = await world();
    await UserModel.updateOne({ _id: w.guestId }, { status: 'suspended' });
    expect((await api.call('GET', `/messages/${w.bookingId}`, { token: w.guest })).status).toBe(401);
  });

  it('M14 the inbox lists only conversations that have messages', async () => {
    const w = await world();
    await seedBooking(w.guestId, w.host.hostId, w.vehicleId);
    await api.call('POST', `/messages/${w.bookingId}`, { token: w.guest, body: { body: 'hello' } });
    const inbox = await api.call<{ bookingId: string }[]>('GET', '/messages', { token: w.guest });
    expect(inbox.body.data?.map((c) => c.bookingId)).toEqual([w.bookingId]);
  });
});

describe('asking a host before booking', () => {
  it('Q1 a guest can ask about a car and the host can answer', async () => {
    const w = await world();
    expect((await api.call('POST', `/inquiries/${w.vehicleId}`, { token: w.guest, body: { body: 'Is it pet friendly?' } })).status).toBe(201);
    expect((await api.call('POST', `/inquiries/${w.vehicleId}/${w.guestId}`, { token: w.hostTok, body: { body: 'Yes' } })).status).toBe(201);
  });

  it('Q2 a host cannot open a thread with a user who never asked', async () => {
    const w = await world();
    const stranger = await seedUser();
    expect((await api.call('POST', `/inquiries/${w.vehicleId}/${stranger}`, { token: w.hostTok, body: { body: 'Book my car!' } })).status).toBe(403);
    expect(await InquiryMessageModel.countDocuments()).toBe(0);
  });

  it('Q3 a host cannot "ask" about their own car', async () => {
    const w = await world();
    expect((await api.call('POST', `/inquiries/${w.vehicleId}`, { token: w.hostTok, body: { body: 'test' } })).status).toBe(403);
  });

  it('Q4 a question about a car that does not exist is a 404', async () => {
    const w = await world();
    expect((await api.call('POST', '/inquiries/no-such-car', { token: w.guest, body: { body: 'hi' } })).status).toBe(404);
  });

  it('Q5 outside links cannot be attached to a question', async () => {
    const w = await world();
    expect((await api.call('POST', `/inquiries/${w.vehicleId}`, { token: w.guest, body: { attachments: [{ url: 'javascript:alert(1)', kind: 'file' }] } })).status).toBe(422);
  });
});
