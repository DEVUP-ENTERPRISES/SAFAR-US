jest.mock('../../payments/infrastructure/gateway.provider', () => ({ paymentGateway: {} }));

import { pricingService } from './pricing.service';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { UserSubscriptionModel } from '../../subscriptions/infrastructure/subscription.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

const trip = () => {
  const start = new Date(Date.now() + 5 * 86_400_000);
  start.setUTCHours(10, 0, 0, 0);
  return { start, end: new Date(start.getTime() + 2 * 86_400_000) };
};

describe('a CATO Plus member quote', () => {
  it('gets 10% off, no service fee, while a guest pays the flat service fee', async () => {
    await VehicleModel.create({
      _id: 'v1', hostId: 'h1', make: 'Kia', model: 'K5', year: 2023, bodyType: 'sedan', transmission: 'automatic', fuelType: 'petrol', seats: 5,
      location: { coordinates: [-96.8, 32.9], state: 'TX', city: 'Dallas' }, listing: { title: 'K5' }, pricing: { dailyPrice: 10_000, currency: 'USD', cleaningFee: 0 }, status: 'listed',
    });
    await UserSubscriptionModel.create({
      userId: 'member', planCode: 'plus', status: 'active', pricePaidCents: 999, renewsAt: new Date(Date.now() + 20 * 86_400_000),
      benefitsSnapshot: { bookingDiscountBps: 1000, waiveSurge: true, waiveServiceFee: true, rewardsMultiplierBps: 20000 },
    });
    const { start, end } = trip();

    const guest = await pricingService.quote({ vehicleId: 'v1', start, end, guestId: 'plain-guest' });
    const member = await pricingService.quote({ vehicleId: 'v1', start, end, guestId: 'member' });

    expect(guest.serviceFee.amount).toBe(250);
    expect(member.serviceFee.amount).toBe(0);
    expect(member.discount.amount).toBe(Math.round(guest.base.amount * 0.1));
    expect(member.total.amount).toBeLessThan(guest.total.amount);
  });
});
