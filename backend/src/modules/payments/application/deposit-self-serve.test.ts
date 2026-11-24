/** The security deposit a guest places from their booking page, and the pickup rule that needs it. Gateway mocked. */
const createIntent = jest.fn();
const retrieveIntent = jest.fn();
const cancel = jest.fn();
jest.mock('../infrastructure/gateway.provider', () => ({
  paymentGateway: {
    createIntent: (...a: unknown[]) => createIntent(...a),
    retrieveIntent: (...a: unknown[]) => retrieveIntent(...a),
    cancel: (...a: unknown[]) => cancel(...a),
  },
}));
jest.mock('./payment-method.service', () => ({
  paymentMethodService: { customerFor: jest.fn(async () => 'cus_1'), save: jest.fn(async () => ({})) },
}));

import { depositService } from './deposit.service';
import { paymentMethodService } from './payment-method.service';
import { PaymentModel } from '../infrastructure/payment.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  [createIntent, retrieveIntent, cancel].forEach((m) => m.mockReset());
  cancel.mockResolvedValue({ status: 'cancelled' });
  createIntent.mockResolvedValue({ intentId: 'pi_dep', clientSecret: 'sec_dep', status: 'requires_payment_method' });
  retrieveIntent.mockResolvedValue({ intentId: 'pi_dep', clientSecret: 'sec_dep', status: 'requires_payment_method' });
});

const HOUR = 3_600_000;
const input = (hoursToPickup: number) => ({ bookingId: 'b1', userId: 'g1', tripStart: new Date(Date.now() + hoursToPickup * HOUR), dailyPrice: 6000, currency: 'USD' });

describe('deposit placed by the guest', () => {
  it('is not offered too early, because a card hold would expire before pickup', async () => {
    const r = await depositService.selfServe(input(24 * 20));
    expect(r.status).toBe('too_early');
    expect(createIntent).not.toHaveBeenCalled();
  });

  it('opens a card hold that keeps the card, sized 2x the daily price within $250-$1,000', async () => {
    const r = await depositService.selfServe(input(48));
    expect(r).toMatchObject({ status: 'needs_payment', clientSecret: 'sec_dep', amount: { amount: 25_000 } });
    expect(createIntent).toHaveBeenCalledWith(expect.objectContaining({ capture: false, saveCard: true, customerId: 'cus_1' }));
    expect((await PaymentModel.findOne({ bookingId: 'b1', type: 'deposit' }).lean())?.status).toBe('pending');
  });

  it('becomes held when Stripe authorises it, and the card is kept for later charges', async () => {
    await depositService.selfServe(input(48));
    retrieveIntent.mockResolvedValue({ intentId: 'pi_dep', clientSecret: 'sec_dep', status: 'requires_capture', paymentMethodId: 'pm_new' });
    const r = await depositService.selfServe(input(48));
    expect(r.status).toBe('held');
    expect((await PaymentModel.findOne({ bookingId: 'b1', type: 'deposit' }).lean())?.status).toBe('authorized');
    expect(paymentMethodService.save).toHaveBeenCalledWith('g1', expect.objectContaining({ stripePaymentMethodId: 'pm_new' }));
  });

  it('an unfinished hold is withdrawn on release', async () => {
    await depositService.selfServe(input(48));
    expect(await depositService.release('b1', 'booking cancelled')).toBe(true);
    expect(cancel).toHaveBeenCalledWith('pi_dep');
    expect((await PaymentModel.findOne({ bookingId: 'b1', type: 'deposit' }).lean())?.status).toBe('cancelled');
  });
});

describe('no deposit for one booking', () => {
  const booking = () => BookingModel.create({
    _id: 'b1', code: 'CD-1', guestId: 'g1', hostId: 'h1', vehicleId: 'v1', status: 'paid',
    period: { start: new Date(Date.now() + 48 * HOUR), end: new Date(Date.now() + 96 * HOUR) },
    priceBreakdown: { days: 2, currency: 'USD', total: { amount: 1, currency: 'USD' } },
    cancellationPolicy: 'flexible',
  });

  it('needs no deposit once staff waive it, releases a hold already placed, and can be undone', async () => {
    await booking();
    await depositService.selfServe(input(48));
    expect(await depositService.waive('b1', 'admin-1', 'CatoDrive staff booking')).toEqual({ waived: true, released: true });
    expect((await BookingModel.findById('b1').lean())?.depositWaiver).toMatchObject({ by: 'admin-1', reason: 'CatoDrive staff booking' });
    expect(await depositService.selfServe(input(48))).toMatchObject({ status: 'not_needed', amount: { amount: 0 } });
    expect(await depositService.amountFor(6000, 'USD', 'g1', 'b1')).toEqual({ amount: 0, currency: 'USD' });

    await depositService.unwaive('b1', 'admin-1');
    expect((await depositService.amountFor(6000, 'USD', 'g1', 'b1')).amount).toBe(25_000);
  });

  it('refuses a booking that does not exist', async () => {
    await expect(depositService.waive('nope', 'admin-1', 'test')).rejects.toThrow();
  });
});
