jest.mock('../../notifications/application/notification.service', () => ({ notificationService: { send: jest.fn(async () => undefined) } }));
jest.mock('../../maps/infrastructure/routing.provider', () => ({ routingProvider: { route: jest.fn() } }));

import { approachService } from './approach.service';
import { routingProvider } from '../../maps/infrastructure/routing.provider';
import { notificationService } from '../../notifications/application/notification.service';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';
import { seedUser, seedHost, seedVehicle, seedBooking } from '../../../testing/fixtures';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  jest.clearAllMocks();
});

const HOME = { lat: 32.8, lng: -96.8 };
const route = routingProvider.route as jest.Mock;

async function delivered() {
  const guestId = await seedUser();
  const host = await seedHost();
  await UserModel.updateOne({ _id: host.userId }, { phone: '+12145550111', firstName: 'Ravi' });
  const vehicleId = await seedVehicle(host.hostId, { registrationNumber: 'ABC 123', specs: { color: 'White' } });
  const bookingId = await seedBooking(guestId, host.hostId, vehicleId, {
    status: 'confirmed', delivery: { mode: 'home', address: '12 Oak St, Dallas', lat: HOME.lat, lng: HOME.lng },
  });
  return { guestId, host, bookingId };
}

describe('car on its way', () => {
  it('starts confirmed, with no driver or plate before anyone sets off', async () => {
    const w = await delivered();
    const s = await approachService.state(w.bookingId, w.guestId);
    expect(s).toMatchObject({ delivery: true, stage: 'confirmed', driver: null });
    expect(s.car?.plate).toBeUndefined();
    expect(s.destination).toMatchObject({ label: '12 Oak St, Dallas' });
  });

  it('once the driver sets off the guest sees who, the plate, and a number to call', async () => {
    const w = await delivered();
    await approachService.setOnWay(w.bookingId, w.host.userId);
    const s = await approachService.state(w.bookingId, w.guestId);
    expect(s.stage).toBe('on_way');
    expect(s.driver).toMatchObject({ name: 'Ravi', phone: '+12145550111' });
    expect(s.car).toMatchObject({ plate: 'ABC123', color: 'White' });
  });

  it('the host side never gets a phone number in this view, and internal markers stay hidden', async () => {
    const w = await delivered();
    await approachService.setOnWay(w.bookingId, w.host.userId);
    const s = await approachService.state(w.bookingId, w.host.userId);
    expect(s.driver?.phone).toBeUndefined();
    expect(JSON.stringify(s.host)).not.toMatch(/byUserId|nearNotifiedAt|etaNotifiedAt/);
  });

  it('a stranger cannot see the approach', async () => {
    const w = await delivered();
    await expect(approachService.state(w.bookingId, await seedUser())).rejects.toThrow('Not your booking');
  });

  it('tells the guest "about N min away" once when the car gets close', async () => {
    const w = await delivered();
    await approachService.setOnWay(w.bookingId, w.host.userId);
    route.mockResolvedValue({ durationInTrafficSeconds: 120 });
    await approachService.onPosition(w.bookingId, 'host', { lat: 32.79, lng: -96.8 });
    await approachService.onPosition(w.bookingId, 'host', { lat: 32.795, lng: -96.8 });
    const near = (notificationService.send as jest.Mock).mock.calls.filter(([n]) => n.templateKey === 'trip.approach.near');
    expect(near).toHaveLength(1);
    expect(near[0][0]).toMatchObject({ userId: w.guestId, title: 'Your car is about 2 min away' });
    expect((await approachService.state(w.bookingId, w.guestId)).stage).toBe('arriving');
  });

  it('marks the car here when it reaches the address', async () => {
    const w = await delivered();
    await approachService.setOnWay(w.bookingId, w.host.userId);
    await approachService.onPosition(w.bookingId, 'host', HOME);
    expect((await approachService.state(w.bookingId, w.guestId)).stage).toBe('arrived');
  });

  it('after the handover the driver card goes away', async () => {
    const w = await delivered();
    await approachService.setOnWay(w.bookingId, w.host.userId);
    await BookingModel.updateOne({ _id: w.bookingId }, { status: 'in_progress' });
    const s = await approachService.state(w.bookingId, w.guestId);
    expect(s).toMatchObject({ stage: 'handed_over', driver: null });
  });

  it('a routing failure never produces an ETA', async () => {
    const w = await delivered();
    await approachService.setOnWay(w.bookingId, w.host.userId);
    route.mockResolvedValue(null);
    await approachService.onPosition(w.bookingId, 'host', { lat: 32.7, lng: -96.8 });
    expect((await approachService.state(w.bookingId, w.guestId)).host.etaAt).toBeUndefined();
  });
});
