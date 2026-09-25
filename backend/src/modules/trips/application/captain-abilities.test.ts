/** A Captain reports damage, SOS and incidents only with the incident ability; the guest and owner always can. */
jest.mock('../../payments/infrastructure/gateway.provider', () => ({ paymentGateway: {} }));

import { tripService } from './trip.service';
import { TripModel } from '../infrastructure/trip.model';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { HostStaffModel } from '../../hosts/infrastructure/host-staff.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);

async function seed(abilities: string[]) {
  await clearTestDb();
  await HostModel.create({ _id: 'host-1', userId: 'owner-1', displayName: 'Fleet' });
  await HostStaffModel.create({
    hostId: 'host-1', userId: 'cap-1', name: 'Cap', email: 'cap@x.com', status: 'active', abilities, vehicleIds: [],
  });
  await TripModel.create({
    _id: 'trip-1', bookingId: 'bk-1', vehicleId: 'veh-1', guestId: 'guest-1', hostId: 'host-1', status: 'active',
    handover: { at: new Date(), odometerStart: 1000 },
  });
}

describe('Captain abilities on emergency actions', () => {
  it('refuses a Captain who can only view the trip', async () => {
    await seed(['trip:view', 'trip:handover']);
    await expect(tripService.reportDamage('cap-1', 'trip-1', 'dent', [])).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(tripService.raiseSos('cap-1', 'trip-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(tripService.raiseIncident('cap-1', 'trip-1', 'accident')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('allows a Captain who holds incident:report, and always the guest and owner', async () => {
    await seed(['trip:view', 'incident:report']);
    await tripService.reportDamage('cap-1', 'trip-1', 'dent', []);
    await tripService.raiseSos('guest-1', 'trip-1');
    await tripService.raiseSos('owner-1', 'trip-1');
    expect((await TripModel.findById('trip-1').lean())?.sosEvents).toHaveLength(2);
  });
});
