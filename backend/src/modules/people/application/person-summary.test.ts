import { personSummaries, personSummary, visibilityFor } from './person-summary.service';
import { inquiryService } from '../../messaging/application/inquiry.service';
import { UserModel } from '../../users/infrastructure/user.model';
import { KycModel } from '../../kyc/infrastructure/kyc.model';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { InquiryMessageModel } from '../../messaging/infrastructure/inquiry-message.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

const DAY = 86_400_000;
async function trip(guestId: string, hostId: string, status: string, endInDays: number) {
  await BookingModel.collection.insertOne({ _id: `b-${Math.random()}` as never, code: `C${Math.random()}`, guestId, hostId, vehicleId: 'v1', status, period: { start: new Date(Date.now() + (endInDays - 2) * DAY), end: new Date(Date.now() + endInDays * DAY) } });
}

describe('who is this person', () => {
  it('names someone with no saved name from their ID, else their email for staff, and never shows hosts an email', async () => {
    const a = await UserModel.create({ email: 'mystery@example.com', roles: ['guest'] });
    const b = await UserModel.create({ email: 'idonly@example.com', roles: ['guest'] });
    await KycModel.create({ userId: String(b._id), status: 'approved', verifiedFirstName: 'Maria', verifiedLastName: 'Lopez', verifiedDob: new Date('1990-05-01'), licenceExpiry: new Date(Date.now() + 300 * DAY) });
    const staff = await personSummaries([String(a._id), String(b._id), 'gone'], { visibility: 'staff' });
    expect(staff.get(String(a._id))).toMatchObject({ name: 'mystery@example.com', identity: 'not_verified', contact: { email: 'mystery@example.com' } });
    expect(staff.get(String(b._id))).toMatchObject({ name: 'Maria Lopez', identity: 'verified', licenceValid: true, contact: { verifiedName: 'Maria Lopez' } });
    expect(staff.get(String(b._id))!.age).toBeGreaterThan(30);
    expect(staff.get('gone')).toMatchObject({ name: 'Deleted account', deleted: true, canBook: false });

    const host = await personSummaries([String(a._id), String(b._id)], { visibility: 'host' });
    expect(host.get(String(a._id))!.name).toBe('New guest (no name yet)');
    expect(host.get(String(b._id))!.name).toBe('Maria L.');
    expect(JSON.stringify([...host.values()])).not.toMatch(/example\.com|contact/);
  });

  it('counts trips, cancellations and trips with this host, and flags an account that can’t book', async () => {
    const g = await UserModel.create({ email: 'g@example.com', firstName: 'Sam', lastName: 'Reed', roles: ['guest'], status: 'under_review' });
    const id = String(g._id);
    await trip(id, 'h1', 'completed', -10);
    await trip(id, 'h2', 'completed', -5);
    await trip(id, 'h1', 'confirmed', 5);
    await trip(id, 'h1', 'cancelled_guest', 3);
    const s = await personSummary(id, { visibility: 'host', hostId: 'h1' });
    expect(s).toMatchObject({ name: 'Sam R.', canBook: false, trips: { completed: 2, upcoming: 1, cancelledByGuest: 1, withThisHost: 1 } });
  });

  it('treats CatoDrive’s fleet operator and console staff as staff, everyone else as a host', async () => {
    const op = await UserModel.create({ email: 'op@catodrive.test', roles: ['house_fleet'] });
    const support = await UserModel.create({ email: 's@catodrive.test', roles: ['support'] });
    const host = await UserModel.create({ email: 'h@example.com', roles: ['guest', 'host'] });
    expect(await visibilityFor(String(op._id))).toBe('staff');
    expect(await visibilityFor(String(support._id))).toBe('staff');
    expect(await visibilityFor(String(host._id))).toBe('host');
  });

  it('gives the inbox a real name and lets only the car’s host open the guest card', async () => {
    const hostUser = await UserModel.create({ email: 'h@example.com', roles: ['guest', 'host'] });
    const host = await HostModel.create({ userId: String(hostUser._id), displayName: 'Pat’s Cars' });
    const v = await VehicleModel.create({ hostId: host._id, year: 2024, make: 'GMC', model: 'Acadia', category: 'suv', status: 'listed', seats: 7, fuelType: 'petrol', transmission: 'automatic', bodyType: 'suv', listing: { title: 'GMC' }, pricing: { dailyPrice: 9000, currency: 'USD' }, location: { city: 'Dallas', state: 'TX', type: 'Point', coordinates: [-96.8, 32.8] } });
    const guest = await UserModel.create({ email: 'asker@example.com', roles: ['guest'] });
    await KycModel.create({ userId: String(guest._id), status: 'approved', verifiedFirstName: 'Dana', verifiedLastName: 'Kim' });
    await InquiryMessageModel.create({ vehicleId: v._id, hostId: host._id, guestId: String(guest._id), senderId: String(guest._id), body: 'Is this a 3 row car?' });

    const [thread] = await inquiryService.hostInbox(String(hostUser._id));
    expect(thread.counterpart.name).toBe('Dana K.');
    const card = await inquiryService.guestProfile(String(hostUser._id), String(v._id), String(guest._id));
    expect(card).toMatchObject({ name: 'Dana K.', identity: 'verified' });
    expect(card.contact).toBeUndefined();
    await expect(inquiryService.guestProfile(String(guest._id), String(v._id), String(guest._id))).rejects.toThrow();
    const stranger = await UserModel.create({ email: 'x@example.com', roles: ['guest'] });
    await expect(inquiryService.guestProfile(String(stranger._id), String(v._id), String(guest._id))).rejects.toThrow();
  });
});
