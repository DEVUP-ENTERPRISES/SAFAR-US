import { randomUUID } from 'crypto';
import { UserModel } from '../modules/users/infrastructure/user.model';
import { HostModel } from '../modules/hosts/infrastructure/host.model';
import { VehicleModel } from '../modules/vehicles/infrastructure/vehicle.model';
import { BookingModel } from '../modules/bookings/infrastructure/booking.model';

const DAY = 86_400_000;

export async function seedUser(over: Record<string, unknown> = {}): Promise<string> {
  const n = randomUUID().slice(0, 8);
  const u = await UserModel.create({ email: `u-${n}@example.com`, firstName: 'Test', lastName: n, roles: ['guest'], status: 'active', ...over });
  return String(u._id);
}

export async function seedHost(): Promise<{ userId: string; hostId: string }> {
  const userId = await seedUser({ roles: ['guest', 'host'] });
  const h = await HostModel.create({ userId, displayName: 'Host Co' });
  return { userId, hostId: String(h._id) };
}

export async function seedVehicle(hostId: string, over: Record<string, unknown> = {}): Promise<string> {
  const v = await VehicleModel.create({
    hostId, make: 'Toyota', model: 'Camry', year: 2023, category: 'sedan', bodyType: 'sedan', transmission: 'automatic', fuelType: 'petrol', seats: 5,
    status: 'listed', verificationStatus: 'verified', listing: { title: 'Toyota Camry', instantBook: true },
    pricing: { dailyPrice: 5000, currency: 'USD' }, location: { type: 'Point', coordinates: [-96.8, 32.78], city: 'Dallas', state: 'TX' },
    ...over,
  });
  return String(v._id);
}

export async function seedBooking(guestId: string, hostId: string, vehicleId: string, over: Record<string, unknown> = {}): Promise<string> {
  const start = new Date(Date.now() + 3 * DAY);
  const b = await BookingModel.create({
    code: `TURA-${randomUUID().slice(0, 6).toUpperCase()}`, guestId, hostId, vehicleId, status: 'paid',
    period: { start, end: new Date(start.getTime() + 2 * DAY) },
    priceBreakdown: { days: 2, currency: 'USD', total: { amount: 10000, currency: 'USD' } },
    cancellationPolicy: 'flexible', statusHistory: [], ...over,
  });
  return String(b._id);
}
