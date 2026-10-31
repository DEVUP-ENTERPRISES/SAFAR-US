jest.mock('../../notifications/application/notification.service', () => ({ notificationService: { send: jest.fn(async () => undefined) } }));

import { claimService } from './claim.service';
import { claimCaseService } from './claim-case.service';
import { ClaimModel } from '../infrastructure/claim.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

async function world() {
  const guest = await UserModel.create({ email: 'guest@example.com', firstName: 'Dana', lastName: 'Kim', roles: ['guest'] });
  const hostUser = await UserModel.create({ email: 'host@example.com', firstName: 'Pat', lastName: 'Lee', roles: ['guest', 'host'] });
  const host = await HostModel.create({ userId: String(hostUser._id), displayName: 'Pat’s Cars' });
  const v = await VehicleModel.create({ hostId: host._id, year: 2024, make: 'GMC', model: 'Acadia', registrationNumber: 'XYZ-123', category: 'suv', status: 'listed', seats: 7, fuelType: 'petrol', transmission: 'automatic', bodyType: 'suv', listing: { title: 'GMC' }, pricing: { dailyPrice: 9000, currency: 'USD' }, location: { city: 'Dallas', state: 'TX', type: 'Point', coordinates: [-96.8, 32.8] } });
  const end = new Date(Date.now() - 3600_000);
  await BookingModel.collection.insertOne({ _id: 'bk1' as never, code: 'CDTRIP1', guestId: String(guest._id), hostId: host._id, vehicleId: String(v._id), status: 'completed', period: { start: new Date(end.getTime() - 2 * 86_400_000), end } });
  return { guestId: String(guest._id), hostUserId: String(hostUser._id) };
}

describe('claims connected to their trip', () => {
  it('refuses a claim that names no trip', async () => {
    const { guestId } = await world();
    await expect(claimService.create(guestId, { type: 'insurance', description: 'Hurts' })).rejects.toThrow('Pick the trip');
  });

  it('shows staff who filed it, against whom, the car, and blocks approving with nothing to go on', async () => {
    const { guestId, hostUserId } = await world();
    const claim = await claimService.create(guestId, { type: 'dispute', description: 'Charged twice for fuel', bookingId: 'bk1', amountClaimed: 4500 });
    const { items } = await claimCaseService.list({});
    expect(items[0]).toMatchObject({ claimant: { name: 'Dana Kim', kind: 'guest' }, respondent: { name: 'Pat Lee' }, booking: { code: 'CDTRIP1' }, vehicle: { name: '2024 GMC Acadia', plate: 'XYZ-123' } });

    const detail = await claimCaseService.detail(claim._id);
    expect(detail).toMatchObject({ claimantSide: 'guest', booking: { code: 'CDTRIP1' }, deposit: null });
    expect(detail.approveBlockers.join(' ')).toMatch(/no evidence/);
    expect(detail.respondent?.id).toBe(hostUserId);

    await expect(claimService.resolve(claim._id, 'staff-1', 'approved', 'ok', 4500)).rejects.toThrow('no evidence');
    await expect(claimService.resolve(claim._id, 'staff-1', 'approved', 'Receipt shows two fuel charges on the same day.', 9000)).rejects.toThrow('more than was claimed');
    const approved = await claimService.resolve(claim._id, 'staff-1', 'approved', 'Receipt shows two fuel charges on the same day.', 4500);
    expect(approved.status).toBe('approved');
  });

  it('lets staff link an old unlinked claim by booking code, only to a trip the filer was on', async () => {
    const { guestId } = await world();
    const orphan = await ClaimModel.create({ type: 'insurance', claimantId: guestId, description: 'Hurts', currency: 'USD', status: 'opened', evidence: [], timeline: [{ status: 'opened', at: new Date(), by: guestId }] });
    expect((await claimCaseService.detail(orphan._id)).approveBlockers[0]).toMatch(/Link this claim/);
    await expect(claimCaseService.linkBooking(orphan._id, 'staff-1', 'NOPE')).rejects.toThrow('No booking');
    const stranger = await UserModel.create({ email: 's@example.com', roles: ['guest'] });
    const other = await ClaimModel.create({ type: 'insurance', claimantId: String(stranger._id), description: 'x', currency: 'USD', status: 'opened', evidence: [], timeline: [] });
    await expect(claimCaseService.linkBooking(other._id, 'staff-1', 'cdtrip1')).rejects.toThrow('wasn’t on that trip');
    const linked = await claimCaseService.linkBooking(orphan._id, 'staff-1', 'cdtrip1');
    expect(linked).toMatchObject({ booking: { code: 'CDTRIP1' }, respondent: { name: 'Pat Lee' } });
    await expect(claimCaseService.linkBooking(orphan._id, 'staff-1', 'CDTRIP1')).rejects.toThrow('already linked');
  });
});
