jest.mock('../../notifications/infrastructure/channel.providers', () => ({
  channelProviders: { email: { send: jest.fn().mockResolvedValue({ ok: true }) } },
}));
jest.mock('../../availability/application/availability.service', () => ({
  availabilityService: { block: jest.fn(async () => undefined), unblock: jest.fn(async () => undefined) },
}));

import { hostStaffService } from './host-staff.service';
import { HostStaffModel } from '../infrastructure/host-staff.model';
import { HostModel } from '../infrastructure/host.model';
import { userRepository } from '../../users/infrastructure/user.repository';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { messageService } from '../../messaging/application/message.service';
import { availabilityService } from '../../availability/application/availability.service';
import { channelProviders } from '../../notifications/infrastructure/channel.providers';
import { config } from '../../../config';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  jest.clearAllMocks();
});

const IOC = 'https://ops.example.com/secret-path';

// The invite email is sent without awaiting it, so wait for it rather than for a fixed time.
async function until(ok: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
}

async function fleet(roles: string[] = ['host', 'house_fleet']) {
  const owner = await userRepository.create({ email: `owner-${roles.length}@x.com`, passwordHash: 'x', firstName: 'Owner', roles } as never);
  await HostModel.collection.insertOne({ _id: 'host-1', userId: owner._id, displayName: 'CatoDrive House Fleet', deletedAt: null } as never);
  return owner;
}

async function car(id: string) {
  return VehicleModel.create({
    _id: id, hostId: 'host-1', year: 2024, make: 'VW', model: 'Atlas', category: 'suv', status: 'listed', seats: 7, registrationNumber: `P-${id}`,
    fuelType: 'petrol', transmission: 'automatic', bodyType: 'suv', listing: { title: 'VW Atlas' },
    pricing: { dailyPrice: 9500, currency: 'USD' }, location: { city: 'Irving', state: 'TX', type: 'Point', coordinates: [-97, 32.8], address: '2400 Aviation Dr' },
  });
}

let phoneSeq = 1000;

async function captain(abilities: string[], vehicleIds: string[] = []) {
  const user = await userRepository.create({ email: `cap-${Math.random()}@x.com`, passwordHash: 'x', firstName: 'Sam', phone: `+1214555${String(++phoneSeq).padStart(4, '0')}` } as never);
  await HostStaffModel.create({ hostId: 'host-1', userId: user._id, email: user.email, name: 'Sam Reed', abilities, vehicleIds, status: 'active', invitedAt: new Date(), acceptedAt: new Date() });
  return user;
}

async function booking(id: string, vehicleId: string, status: string, start: Date, end: Date, guestId = 'guest-1') {
  await BookingModel.collection.insertOne({
    _id: id, code: `C-${id}`, guestId, hostId: 'host-1', vehicleId, status, period: { start, end },
    priceBreakdown: { days: 1, subtotal: { amount: 10_000, currency: 'USD' }, total: { amount: 10_000, currency: 'USD' }, currency: 'USD' },
  } as never);
}

describe('Captain invite link', () => {
  const original = config.notifications.iocWebUrl;
  afterEach(() => { config.notifications.iocWebUrl = original; });

  it('opens the operations panel for the House Fleet and the host site for everyone else', async () => {
    config.notifications.iocWebUrl = IOC;
    const owner = await fleet();
    await hostStaffService.invite(owner._id, { name: 'Sam', email: 'sam@x.com' });
    const send = channelProviders.email.send as jest.Mock;
    await until(() => (channelProviders.email.send as jest.Mock).mock.calls.length > 0);
    expect(send.mock.calls[0][0].deepLink).toMatch(new RegExp(`^${IOC}/captain/accept-invite\\?token=`));

    await clearTestDb();
    send.mockClear();
    const host = await fleet(['host']);
    await hostStaffService.invite(host._id, { name: 'Ana', email: 'ana@x.com' });
    await until(() => (channelProviders.email.send as jest.Mock).mock.calls.length > 0);
    expect(send.mock.calls[0][0].deepLink).toContain('/host/accept-invite?token=');
  });
});

describe('Captain dashboard', () => {
  it('lists pickups and returns on their cars only, flags overdue returns and shows each car’s state', async () => {
    await fleet();
    await car('v1');
    await car('v2');
    await car('v3');
    const cap = await captain(['trip:view', 'trip:handover'], ['v1', 'v2']);
    await userRepository.create({ _id: 'guest-1', email: 'g@x.com', passwordHash: 'x', firstName: 'Riley', phone: '+12145550199' } as never);
    const now = new Date();
    const h = (n: number) => new Date(now.getTime() + n * 3_600_000);
    await booking('b1', 'v1', 'confirmed', h(3), h(30));
    await booking('b2', 'v2', 'in_progress', h(-30), h(-1));
    await booking('b3', 'v3', 'confirmed', h(2), h(20));
    await booking('b4', 'v1', 'cancelled', h(5), h(10));

    const d = (await hostStaffService.captainDashboard(cap._id, now))!;
    expect(d.jobs.map((j) => [j.kind, j.bookingId, j.overdue])).toEqual([['return', 'b2', true], ['pickup', 'b1', false]]);
    expect(d.jobs[1]).toMatchObject({ guestName: 'Riley', guestPhone: '+12145550199', where: '2400 Aviation Dr' });
    expect(d.counts).toMatchObject({ overdue: 1, out: 1, cars: 2 });
    expect(d.cars.find((c) => c._id === 'v2')?.outUntil).toBeDefined();
    expect(d.cars.find((c) => c._id === 'v1')?.nextPickup).toBeDefined();
    expect(JSON.stringify(d)).not.toContain('inviteToken');
  });

  it('hides the guest’s phone from a Captain who doesn’t do handovers', async () => {
    await fleet();
    await car('v1');
    const cap = await captain(['trip:view']);
    await userRepository.create({ _id: 'guest-1', email: 'g@x.com', passwordHash: 'x', firstName: 'Riley', phone: '+12145550199' } as never);
    await booking('b1', 'v1', 'paid', new Date(Date.now() + 3_600_000), new Date(Date.now() + 86_400_000));
    const d = (await hostStaffService.captainDashboard(cap._id))!;
    expect(d.jobs[0].guestPhone).toBeUndefined();
  });

  it('is null for someone who isn’t a Captain', async () => {
    expect(await hostStaffService.captainDashboard('nobody')).toBeNull();
  });
});

describe('Captain abilities that used to do nothing', () => {
  it('blocks dates only with "Block dates", and only on their own cars', async () => {
    await fleet();
    await car('v1');
    await car('v2');
    const without = await captain(['trip:view']);
    const withIt = await captain(['calendar:manage'], ['v1']);
    const range = { start: new Date('2026-12-01'), end: new Date('2026-12-03'), action: 'block' as const };

    await expect(hostStaffService.captainBlockDates(without._id, 'v1', range)).rejects.toThrow('can’t change the calendar');
    await expect(hostStaffService.captainBlockDates(withIt._id, 'v2', range)).rejects.toThrow('can’t change the calendar');
    await hostStaffService.captainBlockDates(withIt._id, 'v1', range);
    expect(availabilityService.block).toHaveBeenCalledWith('v1', range.start, range.end);
    await expect(hostStaffService.captainBlockDates(withIt._id, 'v1', { ...range, end: range.start })).rejects.toThrow('after the start');
  });

  it('lets a Captain with "Message guests" use the trip chat, and nobody else', async () => {
    await fleet();
    await car('v1');
    await booking('b1', 'v1', 'confirmed', new Date(Date.now() + 3_600_000), new Date(Date.now() + 86_400_000));
    const talker = await captain(['trip:message']);
    const quiet = await captain(['trip:view']);

    const msg = await messageService.send(talker._id, 'b1', 'Your car is ready at Terminal D.');
    expect(msg.senderId).toBe(talker._id);
    expect(await messageService.list(talker._id, 'b1')).toHaveLength(1);
    await expect(messageService.send(quiet._id, 'b1', 'hi')).rejects.toThrow('Not part of this conversation');
  });
});
