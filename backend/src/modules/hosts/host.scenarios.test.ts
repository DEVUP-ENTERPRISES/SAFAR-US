jest.mock('../payments/infrastructure/gateway.provider', () => ({ paymentGateway: new (jest.requireActual('../payments/infrastructure/mock.gateway').MockGateway)() }));

import { connectTestDb, clearTestDb, disconnectTestDb } from '../../testing/mongo';
import { startTestApi, tokenFor, type TestApi } from '../../testing/http';
import { seedUser, seedHost, seedVehicle, seedBooking } from '../../testing/fixtures';
import { HostModel } from './infrastructure/host.model';
import { HostStaffModel } from './infrastructure/host-staff.model';
import { VehicleModel } from '../vehicles/infrastructure/vehicle.model';
import { DocumentModel } from '../documents/infrastructure/document.model';
import { AvailabilityModel } from '../availability/infrastructure/availability.model';
import { TripModel } from '../trips/infrastructure/trip.model';
import { ViolationModel } from '../violations/infrastructure/violation.model';
import { MaintenanceModel } from '../maintenance/infrastructure/maintenance.model';
import { availabilityService } from '../availability/application/availability.service';
import { documentComplianceService } from '../documents/application/document-compliance.service';
import { vehicleService } from '../vehicles/application/vehicle.service';
import { pricingService } from '../pricing/application/pricing.service';

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

const DAY = 86_400_000;
const HOST_ROLES = ['guest', 'host'];

async function hostWorld() {
  const host = await seedHost();
  const vehicleId = await seedVehicle(host.hostId);
  const other = await seedHost();
  return {
    ...host, vehicleId,
    tok: await tokenFor(host.userId, HOST_ROLES),
    otherTok: await tokenFor(other.userId, HOST_ROLES),
    other,
  };
}

const newCar = (photos: unknown[] = []) => ({
  make: 'Honda', model: 'Civic', year: 2022, bodyType: 'sedan', transmission: 'automatic', fuelType: 'petrol', seats: 5,
  location: { lng: -96.8, lat: 32.78 }, listing: { title: 'Honda Civic 2022' }, pricing: { dailyPrice: 4500 }, photos,
});

describe('host profile', () => {
  it('H1 saving the profile keeps the Stripe payout account', async () => {
    const w = await hostWorld();
    await HostModel.updateOne({ _id: w.hostId }, { $set: { 'bankingDetails.stripeConnectedAccountId': 'acct_123' } });
    const r = await api.call('PATCH', '/hosts/me', { token: w.tok, body: { displayName: 'New Name', bankingDetails: { bankName: 'Chase', accountHolder: 'Sam' } } });
    expect(r.status).toBe(200);
    const h = await HostModel.findById(w.hostId).lean();
    expect(h?.bankingDetails).toMatchObject({ stripeConnectedAccountId: 'acct_123', bankName: 'Chase' });
  });

  it('H2 a host cannot point payouts at their own Stripe account through the profile', async () => {
    const w = await hostWorld();
    await HostModel.updateOne({ _id: w.hostId }, { $set: { 'bankingDetails.stripeConnectedAccountId': 'acct_real' } });
    await api.call('PATCH', '/hosts/me', { token: w.tok, body: { bankingDetails: { stripeConnectedAccountId: 'acct_evil' } } });
    expect((await HostModel.findById(w.hostId).lean())?.bankingDetails?.stripeConnectedAccountId).toBe('acct_real');
  });

  it('H3 saving business details keeps fields the form does not send', async () => {
    const w = await hostWorld();
    await HostModel.updateOne({ _id: w.hostId }, { $set: { businessProfile: { legalName: 'Old LLC', supportEmail: 'help@host.example' } } });
    await api.call('PATCH', '/hosts/me', { token: w.tok, body: { businessProfile: { legalName: 'New LLC' } } });
    expect((await HostModel.findById(w.hostId).lean())?.businessProfile).toMatchObject({ legalName: 'New LLC', supportEmail: 'help@host.example' });
  });

  it('H4 an outside image cannot be the public host photo', async () => {
    const w = await hostWorld();
    expect((await api.call('PATCH', '/hosts/me', { token: w.tok, body: { avatarUrl: 'https://tracker.example/p.png' } })).status).toBe(422);
  });

  it('H5 the host’s own uploaded photo is accepted', async () => {
    const w = await hostWorld();
    const key = `avatar/2026/11/${w.userId}/me.jpg`;
    expect((await api.call('PATCH', '/hosts/me', { token: w.tok, body: { avatarUrl: `https://cdn.test/${key}`, avatarKey: key } })).status).toBe(200);
  });

  it('H6 the public profile never shows bank or tax details', async () => {
    const w = await hostWorld();
    await HostModel.updateOne({ _id: w.hostId }, { $set: { 'bankingDetails.accountNumberMasked': '****9876', 'taxInfo.taxId': '12-3456789' } });
    const r = await api.call('GET', `/hosts/${w.hostId}/public`);
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body.data)).not.toMatch(/9876|3456789/);
  });

  it('H7 a guest without a host profile gets a clear 404 on host pages', async () => {
    const tok = await tokenFor(await seedUser());
    expect((await api.call('GET', '/earnings/dashboard', { token: tok })).status).toBe(404);
  });

  it('H8 a nonsense insights range falls back instead of breaking', async () => {
    const w = await hostWorld();
    expect((await api.call('GET', '/earnings/insights?days=abc', { token: w.tok })).status).toBe(200);
  });
});

describe('listing a car', () => {
  it('C0 a host not yet approved cannot list a car', async () => {
    const w = await hostWorld();
    expect((await api.call('POST', '/vehicles', { token: w.tok, body: newCar() })).status).toBe(403);
  });

  it('C1 photos from an outside site are refused', async () => {
    const w = await hostWorld();
    await HostModel.updateOne({ _id: w.hostId }, { verificationStatus: 'verified' });
    expect((await api.call('POST', '/vehicles', { token: w.tok, body: newCar([{ url: 'https://evil.example/car.jpg' }]) })).status).toBe(422);
  });

  it('C2 the host’s own uploaded photos are accepted', async () => {
    const w = await hostWorld();
    await HostModel.updateOne({ _id: w.hostId }, { verificationStatus: 'verified' });
    const key = `vehicle_photo/2026/11/${w.userId}/c1.jpg`;
    const r = await api.call<{ photos: { url: string }[] }>('POST', '/vehicles', { token: w.tok, body: newCar([{ url: `https://cdn.test/${key}`, key }]) });
    expect(r.status).toBe(201);
    expect(decodeURIComponent(r.body.data?.photos[0].url ?? '')).toContain(key);
  });

  it('C3 another host’s uploads cannot be added to my car', async () => {
    const w = await hostWorld();
    const key = `vehicle_photo/2026/11/${w.other.userId}/x.jpg`;
    expect((await api.call('POST', `/vehicles/${w.vehicleId}/photos`, { token: w.tok, body: { photos: [{ url: `https://cdn.test/${key}`, key }] } })).status).toBe(422);
  });

  it('C4 a listing holds at most 40 photos', async () => {
    const w = await hostWorld();
    const many = Array.from({ length: 41 }, (_, i) => ({ url: `https://cdn.test/vehicle_photo/2026/11/${w.userId}/${i}.jpg`, key: `vehicle_photo/2026/11/${w.userId}/${i}.jpg` }));
    expect((await api.call('POST', `/vehicles/${w.vehicleId}/photos`, { token: w.tok, body: { photos: many } })).status).toBe(422);
  });

  it('C5 a host cannot edit, price or add photos to someone else’s car', async () => {
    const w = await hostWorld();
    expect([403, 404]).toContain((await api.call('PATCH', `/vehicles/${w.vehicleId}`, { token: w.otherTok, body: { listing: { title: 'Mine now' } } })).status);
    expect([403, 404]).toContain((await api.call('PUT', `/vehicles/${w.vehicleId}/pricing`, { token: w.otherTok, body: { dailyPrice: 100 } })).status);
    expect([403, 404]).toContain((await api.call('PATCH', `/vehicles/${w.vehicleId}/status`, { token: w.otherTok, body: { status: 'paused' } })).status);
  });

  it('C6 a car staff suspended cannot be relisted by the host', async () => {
    const w = await hostWorld();
    await vehicleService.adminSetStatus(w.vehicleId, 'suspend');
    const r = await api.call('PATCH', `/vehicles/${w.vehicleId}/status`, { token: w.tok, body: { status: 'listed' } });
    expect(r.status).toBe(409);
    expect(r.body.error?.code).toBe('STAFF_HOLD');
  });

  it('C7 staff approving lifts the hold', async () => {
    const w = await hostWorld();
    await vehicleService.adminSetStatus(w.vehicleId, 'suspend');
    await vehicleService.adminSetStatus(w.vehicleId, 'approve');
    expect((await VehicleModel.findById(w.vehicleId).lean())).toMatchObject({ status: 'listed', staffHold: false });
  });

  it('C8 an unverified car cannot be listed', async () => {
    const w = await hostWorld();
    await VehicleModel.updateOne({ _id: w.vehicleId }, { status: 'paused', verificationStatus: 'pending' });
    expect((await api.call('PATCH', `/vehicles/${w.vehicleId}/status`, { token: w.tok, body: { status: 'listed' } })).status).toBe(409);
  });

  it('C9 a host can pause their own listed car', async () => {
    const w = await hostWorld();
    expect((await api.call('PATCH', `/vehicles/${w.vehicleId}/status`, { token: w.tok, body: { status: 'paused' } })).status).toBe(200);
    expect((await VehicleModel.findById(w.vehicleId).lean())?.status).toBe('paused');
  });
});

describe('pricing', () => {
  it('P1 a daily price over $10,000 is refused as a likely typo', async () => {
    const w = await hostWorld();
    expect((await api.call('PUT', `/vehicles/${w.vehicleId}/pricing`, { token: w.tok, body: { dailyPrice: 2_000_000 } })).status).toBe(422);
  });

  it('P2 a season that ends before it starts is refused', async () => {
    const w = await hostWorld();
    const r = await api.call('PUT', `/vehicles/${w.vehicleId}/pricing`, { token: w.tok, body: { seasonalRules: [{ label: 'Xmas', start: '2026-12-31', end: '2026-12-20', multiplierBps: 15000 }] } });
    expect(r.status).toBe(422);
  });

  it('P3 a valid season is saved', async () => {
    const w = await hostWorld();
    const r = await api.call('PUT', `/vehicles/${w.vehicleId}/pricing`, { token: w.tok, body: { seasonalRules: [{ label: 'Xmas', start: '2026-12-20', end: '2026-12-31', multiplierBps: 15000 }] } });
    expect(r.status).toBe(200);
  });

  it('P4 stacked host discounts never take the price to zero', async () => {
    const w = await hostWorld();
    await VehicleModel.updateOne({ _id: w.vehicleId }, { $set: { 'pricing.weeklyDiscountBps': 9000, 'pricing.promoActive': true, 'pricing.promoDiscountBps': 9000 } });
    const start = new Date(Date.now() + 10 * DAY);
    const q = await pricingService.quote({ vehicleId: w.vehicleId, start, end: new Date(start.getTime() + 7 * DAY) });
    expect(q.discount.amount).toBeLessThanOrEqual(Math.round(q.base.amount * 0.8));
    expect(q.base.amount - q.discount.amount).toBeGreaterThan(0);
  });
});

describe('calendar', () => {
  const range = (fromDays: number, toDays: number) => ({ start: new Date(Date.now() + fromDays * DAY).toISOString(), end: new Date(Date.now() + toDays * DAY).toISOString() });

  it('K1 a host blocks and unblocks their own dates', async () => {
    const w = await hostWorld();
    expect((await api.call('PUT', `/vehicles/${w.vehicleId}/availability`, { token: w.tok, body: { ...range(5, 7), action: 'block' } })).status).toBe(200);
    expect(await AvailabilityModel.countDocuments({ vehicleId: w.vehicleId, state: 'blocked' })).toBeGreaterThan(0);
    await api.call('PUT', `/vehicles/${w.vehicleId}/availability`, { token: w.tok, body: { ...range(5, 7), action: 'unblock' } });
    expect(await AvailabilityModel.countDocuments({ vehicleId: w.vehicleId, state: 'blocked' })).toBe(0);
  });

  it('K2 an end before the start is refused', async () => {
    const w = await hostWorld();
    expect((await api.call('PUT', `/vehicles/${w.vehicleId}/availability`, { token: w.tok, body: { ...range(7, 5), action: 'block' } })).status).toBe(422);
  });

  it('K3 blocking more than two years at once is refused', async () => {
    const w = await hostWorld();
    expect((await api.call('PUT', `/vehicles/${w.vehicleId}/availability`, { token: w.tok, body: { ...range(1, 1000), action: 'block' } })).status).toBe(422);
  });

  it('K4 unblocking never reopens days held by a scheduled pause', async () => {
    const w = await hostWorld();
    const days = await availabilityService.tripDayKeys(w.vehicleId, new Date(Date.now() + 5 * DAY), new Date(Date.now() + 7 * DAY));
    await availabilityService.blockForPause(w.vehicleId, days, 'pause-1');
    await api.call('PUT', `/vehicles/${w.vehicleId}/availability`, { token: w.tok, body: { ...range(4, 8), action: 'unblock' } });
    expect(await AvailabilityModel.countDocuments({ vehicleId: w.vehicleId, pauseId: 'pause-1' })).toBe(days.length);
  });

  it('K5 unblocking never frees booked days', async () => {
    const w = await hostWorld();
    const start = new Date(Date.now() + 5 * DAY);
    const end = new Date(Date.now() + 7 * DAY);
    const b = await seedBooking(await seedUser(), w.hostId, w.vehicleId, { status: 'confirmed', period: { start, end } });
    await availabilityService.confirmHold(await availabilityService.placeHold(w.vehicleId, start, end), b);
    await api.call('PUT', `/vehicles/${w.vehicleId}/availability`, { token: w.tok, body: { ...range(4, 8), action: 'unblock' } });
    expect(await availabilityService.isAvailable(w.vehicleId, start, end)).toBe(false);
  });

  it('K6 another host cannot change my calendar', async () => {
    const w = await hostWorld();
    expect([403, 404]).toContain((await api.call('PUT', `/vehicles/${w.vehicleId}/availability`, { token: w.otherTok, body: { ...range(5, 7), action: 'block' } })).status);
  });
});

describe('car documents', () => {
  const docKey = (userId: string) => `insurance/2026/11/${userId}/policy.jpg`;

  it('D1 car insurance needs a future expiry date', async () => {
    const w = await hostWorld();
    const base = { vehicleId: w.vehicleId, category: 'insurance', key: docKey(w.userId) };
    expect((await api.call('POST', '/documents', { token: w.tok, body: base })).status).toBe(422);
    expect((await api.call('POST', '/documents', { token: w.tok, body: { ...base, expiresAt: '2020-01-01' } })).status).toBe(422);
    expect((await api.call('POST', '/documents', { token: w.tok, body: { ...base, expiresAt: new Date(Date.now() + 200 * DAY).toISOString() } })).status).toBe(201);
  });

  it('D2 a renewal clears a lapsed car', async () => {
    const w = await hostWorld();
    await DocumentModel.create({ ownerId: w.userId, vehicleId: w.vehicleId, category: 'insurance', key: docKey(w.userId), url: 'u', expiresAt: new Date(Date.now() - DAY) });
    expect(await documentComplianceService.hasExpiredMandatoryDoc(w.vehicleId)).toBe(true);
    await DocumentModel.create({ ownerId: w.userId, vehicleId: w.vehicleId, category: 'insurance', key: docKey(w.userId), url: 'u', expiresAt: new Date(Date.now() + 300 * DAY) });
    expect(await documentComplianceService.hasExpiredMandatoryDoc(w.vehicleId)).toBe(false);
  });

  it('D3 the hourly sweep pauses a lapsed car and relists it after renewal', async () => {
    const w = await hostWorld();
    await DocumentModel.create({ ownerId: w.userId, vehicleId: w.vehicleId, category: 'registration', key: 'k', url: 'u', expiresAt: new Date(Date.now() - DAY) });
    await documentComplianceService.sweep();
    expect((await VehicleModel.findById(w.vehicleId).lean())).toMatchObject({ status: 'paused', complianceHold: true });
    await DocumentModel.create({ ownerId: w.userId, vehicleId: w.vehicleId, category: 'registration', key: 'k2', url: 'u', expiresAt: new Date(Date.now() + 300 * DAY) });
    await documentComplianceService.sweep();
    expect((await VehicleModel.findById(w.vehicleId).lean())).toMatchObject({ status: 'listed', complianceHold: false });
  });

  it('D4 a rejected renewal does not count', async () => {
    const w = await hostWorld();
    await DocumentModel.create({ ownerId: w.userId, vehicleId: w.vehicleId, category: 'insurance', key: 'k', url: 'u', expiresAt: new Date(Date.now() - DAY) });
    await DocumentModel.create({ ownerId: w.userId, vehicleId: w.vehicleId, category: 'insurance', key: 'k2', url: 'u', expiresAt: new Date(Date.now() + 300 * DAY), verification: { status: 'rejected' } });
    expect(await documentComplianceService.hasExpiredMandatoryDoc(w.vehicleId)).toBe(true);
  });

  it('D5 the sweep never relists a car staff suspended', async () => {
    const w = await hostWorld();
    await DocumentModel.create({ ownerId: w.userId, vehicleId: w.vehicleId, category: 'insurance', key: 'k', url: 'u', expiresAt: new Date(Date.now() - DAY) });
    await documentComplianceService.sweep();
    await VehicleModel.updateOne({ _id: w.vehicleId }, { staffHold: true });
    await DocumentModel.create({ ownerId: w.userId, vehicleId: w.vehicleId, category: 'insurance', key: 'k2', url: 'u', expiresAt: new Date(Date.now() + 300 * DAY) });
    await documentComplianceService.sweep();
    expect((await VehicleModel.findById(w.vehicleId).lean())?.status).toBe('paused');
  });

  it('D6 a host cannot attach papers to someone else’s car', async () => {
    const w = await hostWorld();
    const r = await api.call('POST', '/documents', { token: w.otherTok, body: { vehicleId: w.vehicleId, category: 'insurance', key: docKey(w.other.userId), expiresAt: new Date(Date.now() + 200 * DAY).toISOString() } });
    expect([403, 404]).toContain(r.status);
  });
});

describe('citations', () => {
  async function trip(w: Awaited<ReturnType<typeof hostWorld>>, over: { handoverDaysAgo?: number; returnDaysAgo?: number | null; status?: string } = {}) {
    const guestId = await seedUser();
    const start = new Date(Date.now() - (over.handoverDaysAgo ?? 5) * DAY);
    const end = new Date(start.getTime() + 2 * DAY);
    const bookingId = await seedBooking(guestId, w.hostId, w.vehicleId, { status: over.status ?? 'completed', period: { start, end } });
    if (over.status !== 'cancelled_guest') {
      await TripModel.create({ bookingId, vehicleId: w.vehicleId, guestId, hostId: w.hostId, status: 'completed', handover: { at: start },
        ...(over.returnDaysAgo === null ? {} : { return: { at: new Date(Date.now() - (over.returnDaysAgo ?? 3) * DAY) } }) });
    }
    return { guestId, bookingId, start, end, guest: await tokenFor(guestId) };
  }
  const ticket = (bookingId: string, at: Date, evidence: unknown[] = []) => ({ bookingId, type: 'parking', citationRef: 'PK-1', issuedBy: 'City of Dallas', occurredAt: at.toISOString(), amount: 5000, evidence });

  it('V1 a host reports a ticket from the trip with their own photo of it', async () => {
    const w = await hostWorld();
    const t = await trip(w);
    const key = `claim/2026/11/${w.userId}/ticket.jpg`;
    const r = await api.call('POST', '/violations', { token: w.tok, body: ticket(t.bookingId, new Date(t.start.getTime() + DAY), [{ url: `https://cdn.test/${key}`, kind: 'image' }]) });
    expect(r.status).toBe(201);
  });

  it('V2 no citation on a booking where the guest never picked up the car', async () => {
    const w = await hostWorld();
    const t = await trip(w, { status: 'cancelled_guest' });
    const r = await api.call('POST', '/violations', { token: w.tok, body: ticket(t.bookingId, new Date(t.start.getTime() + DAY), [{ url: `https://cdn.test/claim/2026/11/${w.userId}/t.jpg`, kind: 'image' }]) });
    expect(r.status).toBe(409);
    expect(r.body.error?.code).toBe('NO_HANDOVER');
  });

  it('V3 a ticket during a late return counts', async () => {
    const w = await hostWorld();
    const t = await trip(w, { handoverDaysAgo: 6, returnDaysAgo: 2 });
    const lateMoment = new Date(t.end.getTime() + 12 * 3_600_000);
    const r = await api.call('POST', '/violations', { token: w.tok, body: ticket(t.bookingId, lateMoment, [{ url: `https://cdn.test/claim/2026/11/${w.userId}/t.jpg`, kind: 'image' }]) });
    expect(r.status).toBe(201);
  });

  it('V4 a ticket from after the car came back is refused', async () => {
    const w = await hostWorld();
    const t = await trip(w, { handoverDaysAgo: 6, returnDaysAgo: 3 });
    const r = await api.call('POST', '/violations', { token: w.tok, body: ticket(t.bookingId, new Date(Date.now() - DAY), [{ url: `https://cdn.test/claim/2026/11/${w.userId}/t.jpg`, kind: 'image' }]) });
    expect(r.status).toBe(422);
  });

  it('V5 evidence from an outside site is refused', async () => {
    const w = await hostWorld();
    const t = await trip(w);
    expect((await api.call('POST', '/violations', { token: w.tok, body: ticket(t.bookingId, new Date(t.start.getTime() + DAY), [{ url: 'javascript:alert(1)', kind: 'file' }]) })).status).toBe(422);
  });

  it('V6 only this trip’s host can report it', async () => {
    const w = await hostWorld();
    const t = await trip(w);
    expect((await api.call('POST', '/violations', { token: w.otherTok, body: ticket(t.bookingId, new Date(t.start.getTime() + DAY), [{ url: `https://cdn.test/claim/2026/11/${w.other.userId}/t.jpg`, kind: 'image' }]) })).status).toBe(403);
  });

  it('V7 the guest can open the notice; a stranger cannot', async () => {
    const w = await hostWorld();
    const t = await trip(w);
    const key = `claim/2026/11/${w.userId}/ticket.jpg`;
    const made = await api.call<{ _id: string }>('POST', '/violations', { token: w.tok, body: ticket(t.bookingId, new Date(t.start.getTime() + DAY), [{ url: `https://cdn.test/${key}`, kind: 'image' }]) });
    const id = made.body.data!._id;
    const mine = await api.call<{ url: string }>('GET', `/violations/${id}/evidence/0`, { token: t.guest });
    expect(mine.status).toBe(200);
    expect(mine.body.data?.url).toBeTruthy();
    expect((await api.call('GET', `/violations/${id}/evidence/0`, { token: await tokenFor(await seedUser()) })).status).toBe(403);
    expect(await ViolationModel.countDocuments()).toBe(1);
  });
});

describe('claims', () => {
  it('L1 claim evidence from an outside site is refused', async () => {
    const w = await hostWorld();
    const guestId = await seedUser();
    const bookingId = await seedBooking(guestId, w.hostId, w.vehicleId, { status: 'completed' });
    const r = await api.call('POST', '/claims', { token: await tokenFor(guestId), body: { type: 'other', bookingId, description: 'The car smelled of smoke', evidence: [{ url: 'https://evil.example/x.jpg', kind: 'image' }] } });
    expect(r.status).toBe(422);
  });
});

describe('team (Captains)', () => {
  async function invite(w: Awaited<ReturnType<typeof hostWorld>>, daysAgo: number) {
    await HostStaffModel.create({ hostId: w.hostId, email: 'cap@example.com', name: 'Cap', abilities: [], vehicleIds: [], status: 'invited', inviteToken: 'tok'.repeat(10), invitedAt: new Date(Date.now() - daysAgo * DAY) });
    return 'tok'.repeat(10);
  }

  it('T1 a fresh invite link works', async () => {
    const w = await hostWorld();
    const token = await invite(w, 1);
    expect((await api.call('GET', `/hosts/staff/invite/${token}`)).status).toBe(200);
  });

  it('T2 an old invite link has expired', async () => {
    const w = await hostWorld();
    const token = await invite(w, 30);
    expect((await api.call('GET', `/hosts/staff/invite/${token}`)).status).toBe(409);
    expect((await api.call('POST', '/hosts/staff/accept', { body: { token, password: 'longpassword1' } })).status).toBe(409);
  });

  it('T3 a host cannot manage another host’s team member', async () => {
    const w = await hostWorld();
    const staff = await HostStaffModel.create({ hostId: w.hostId, email: 'cap2@example.com', name: 'Cap', abilities: [], vehicleIds: [], status: 'active' });
    expect([403, 404]).toContain((await api.call('DELETE', `/hosts/staff/${staff._id}`, { token: w.otherTok })).status);
  });
});

describe('maintenance and bookings', () => {
  it('B1 a host cannot complete another host’s maintenance', async () => {
    const w = await hostWorld();
    const rec = await MaintenanceModel.create({ hostId: w.hostId, vehicleId: w.vehicleId, type: 'service', scheduledFor: new Date() });
    expect((await api.call('POST', `/maintenance/${rec._id}/complete`, { token: w.otherTok })).status).toBe(404);
  });

  it('B2 a host cannot approve or decline another host’s request', async () => {
    const w = await hostWorld();
    const b = await seedBooking(await seedUser(), w.hostId, w.vehicleId, { status: 'pending_approval' });
    expect([403, 404]).toContain((await api.call('POST', `/bookings/${b}/confirm`, { token: w.otherTok })).status);
    expect([403, 404]).toContain((await api.call('POST', `/bookings/${b}/decline`, { token: w.otherTok })).status);
  });

  it('B3 a host sees only their own trips in their list', async () => {
    const w = await hostWorld();
    await seedBooking(await seedUser(), w.hostId, w.vehicleId);
    const r = await api.call<unknown[]>('GET', '/trips/host/booked', { token: w.otherTok });
    expect(r.status).toBe(200);
    expect(r.body.data ?? []).toHaveLength(0);
  });
});
