jest.mock('../../notifications/application/notification.service', () => ({ notificationService: { send: jest.fn(async () => undefined) } }));

import { vehiclePauseService, pauseDays } from './vehicle-pause.service';
import { assetPartnerService } from '../../asset-partners/application/asset-partner.service';
import { VehicleModel } from '../infrastructure/vehicle.model';
import { VehiclePauseModel } from '../infrastructure/vehicle-pause.model';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { AvailabilityModel } from '../../availability/infrastructure/availability.model';
import { notificationService } from '../../notifications/application/notification.service';
import { localDateKey } from '../../../shared/utils/us-timezone';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  jest.clearAllMocks();
});

const notify = notificationService.send as jest.Mock;
const TZ = 'America/Chicago';
const day = (offset: number) => localDateKey(new Date(Date.now() + offset * 86_400_000), TZ);
const flush = () => new Promise((r) => setTimeout(r, 30));

async function setup() {
  const ops = await UserModel.create({ email: 'ops@catodrive.test', roles: ['host', 'house_fleet'], status: 'active' });
  await HostModel.create({ _id: 'host-1', userId: String(ops._id), displayName: 'CatoDrive Fleet' });
  const partner = await assetPartnerService.enrol({ userId: 'partner-user', hostId: 'host-1', partnerType: 'individual', displayName: 'Jordan Ramirez' });
  await VehicleModel.create({
    _id: 'veh-1', hostId: 'host-1', assetPartnerId: partner._id, year: 2024, make: 'BMW', model: 'X5', category: 'suv', status: 'listed', verificationStatus: 'verified',
    seats: 5, fuelType: 'petrol', transmission: 'automatic', bodyType: 'suv', listing: { title: 'BMW X5' }, pricing: { dailyPrice: 15000, currency: 'USD' },
    location: { city: 'Dallas', state: 'TX', type: 'Point', coordinates: [-96.8, 32.8] },
  });
  return { opsId: String(ops._id), partner };
}
const car = () => VehicleModel.findById('veh-1').lean();

describe('pauseDays', () => {
  it('lists every day off, not the return day', () => {
    expect(pauseDays('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01']);
    expect(pauseDays('2026-12-30', '2026-12-30')).toEqual([]);
  });
});

describe('operations pause', () => {
  it('pauses a live car now and brings it back on Resume', async () => {
    const { opsId } = await setup();
    const p = await vehiclePauseService.pauseNow(opsId, 'veh-1', { reason: 'Windshield repair' });
    expect(p.status).toBe('active');
    expect(await car()).toMatchObject({ status: 'paused', pauseId: p._id });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'partner-user', title: 'Your car is paused' }));

    await expect(vehiclePauseService.pauseNow(opsId, 'veh-1', { reason: 'again' })).rejects.toThrow('Only a live car');
    await vehiclePauseService.resume(opsId, 'veh-1');
    const v = await car();
    expect(v?.status).toBe('listed');
    expect(v?.pauseId).toBeUndefined();
    expect((await VehiclePauseModel.findById(p._id).lean())?.status).toBe('ended');
  });

  it('refuses someone who does not run the car', async () => {
    await setup();
    await expect(vehiclePauseService.pauseNow('stranger', 'veh-1', { reason: 'test' })).rejects.toThrow();
  });

  it('comes back by itself on the return date', async () => {
    const { opsId } = await setup();
    const p = await vehiclePauseService.pauseNow(opsId, 'veh-1', { reason: 'Detailing', backOnDay: day(2) });
    expect((await vehiclePauseService.sweep()).ended).toBe(0);
    expect((await vehiclePauseService.sweep(new Date(p.endsAt!.getTime() + 1000))).ended).toBe(1);
    expect((await car())?.status).toBe('listed');
  });

  it('stays off after the pause if a recall hold arrived meanwhile', async () => {
    const { opsId } = await setup();
    const p = await vehiclePauseService.pauseNow(opsId, 'veh-1', { reason: 'Service', backOnDay: day(1) });
    await VehicleModel.updateOne({ _id: 'veh-1' }, { recallHold: true });
    await vehiclePauseService.sweep(new Date(p.endsAt!.getTime() + 1000));
    expect((await car())?.status).toBe('paused');
    expect((await VehiclePauseModel.findById(p._id).lean())?.endNote).toMatch(/safety recall/);
  });

  it('does not relist a car an admin suspended during the pause', async () => {
    const { opsId } = await setup();
    const p = await vehiclePauseService.pauseNow(opsId, 'veh-1', { reason: 'Service', backOnDay: day(1) });
    const { vehicleService } = await import('./vehicle.service');
    await vehicleService.adminSetStatus('veh-1', 'suspend');
    await vehiclePauseService.sweep(new Date(p.endsAt!.getTime() + 1000));
    expect((await car())?.status).toBe('paused');
    expect((await VehiclePauseModel.findById(p._id).lean())?.status).toBe('ended');
  });
});

describe('partner pause request', () => {
  it('is reviewed, blocks its days, starts and ends on schedule', async () => {
    await setup();
    const from = day(3);
    const back = day(6);
    const req = await vehiclePauseService.request('partner-user', 'veh-1', { reason: 'Family trip', fromDay: from, backOnDay: back });
    expect(req.status).toBe('pending');
    await flush();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Partner asked to pause a car', templateKey: 'asset_partner.pause_request' }));
    await expect(vehiclePauseService.request('partner-user', 'veh-1', { reason: 'again', fromDay: from, backOnDay: back })).rejects.toThrow('already has a pause');

    const list = await vehiclePauseService.list({ status: 'pending' });
    expect(list.items[0]).toMatchObject({ vehicleLabel: '2024 BMW X5', partnerName: 'Jordan Ramirez', tripsInWindow: 0 });

    const ok = await vehiclePauseService.approve('ops', req._id);
    expect(ok.status).toBe('scheduled');
    expect(await AvailabilityModel.countDocuments({ vehicleId: 'veh-1', pauseId: req._id, state: 'blocked' })).toBe(3);
    expect((await car())?.status).toBe('listed');

    await vehiclePauseService.sweep(new Date(ok.startsAt.getTime() + 1000));
    expect((await car())?.status).toBe('paused');
    await vehiclePauseService.sweep(new Date(ok.endsAt!.getTime() + 1000));
    expect((await car())?.status).toBe('listed');
    expect(await AvailabilityModel.countDocuments({ pauseId: req._id })).toBe(0);
  });

  it('cannot be approved over a booked trip, and leaves host blocks alone', async () => {
    await setup();
    const from = day(2);
    await AvailabilityModel.create({ vehicleId: 'veh-1', dayKey: from, state: 'booked', bookingId: 'b-1' });
    await AvailabilityModel.create({ vehicleId: 'veh-1', dayKey: day(3), state: 'blocked' });
    const req = await vehiclePauseService.request('partner-user', 'veh-1', { reason: 'Moving', fromDay: from, backOnDay: day(5) });
    expect((await vehiclePauseService.list({ status: 'pending' })).items[0].tripsInWindow).toBe(1);
    await expect(vehiclePauseService.approve('ops', req._id)).rejects.toThrow('1 trip is booked');

    await AvailabilityModel.deleteOne({ bookingId: 'b-1' });
    await vehiclePauseService.approve('ops', req._id);
    await vehiclePauseService.cancel('partner-user', req._id);
    expect(await AvailabilityModel.countDocuments({ vehicleId: 'veh-1', state: 'blocked' })).toBe(1);
  });

  it('declines with a reason the partner sees', async () => {
    await setup();
    const req = await vehiclePauseService.request('partner-user', 'veh-1', { reason: 'Trip', fromDay: day(1), backOnDay: day(4) });
    await vehiclePauseService.decline('ops', req._id, 'The car is booked for a wedding that week.');
    expect(await vehiclePauseService.partnerLatest('partner-user', 'veh-1')).toMatchObject({ status: 'declined', declineReason: 'The car is booked for a wedding that week.' });
    await expect(vehiclePauseService.approve('ops', req._id)).rejects.toThrow('no longer waiting');
  });

  it('rejects past dates, reversed dates and other partners’ cars', async () => {
    await setup();
    await expect(vehiclePauseService.request('partner-user', 'veh-1', { reason: 'Trip', fromDay: day(-2), backOnDay: day(2) })).rejects.toThrow('past');
    await expect(vehiclePauseService.request('partner-user', 'veh-1', { reason: 'Trip', fromDay: day(4), backOnDay: day(2) })).rejects.toThrow('after the first day');
    await assetPartnerService.enrol({ userId: 'other-user', hostId: 'host-2', partnerType: 'individual', displayName: 'Sam' });
    await expect(vehiclePauseService.request('other-user', 'veh-1', { reason: 'Trip', fromDay: day(1), backOnDay: day(2) })).rejects.toThrow('not found');
  });
});
