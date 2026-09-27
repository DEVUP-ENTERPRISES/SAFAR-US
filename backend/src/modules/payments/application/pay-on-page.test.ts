/** Paying on the page with another method: the saved card is never used, and the booking waits until Stripe has the money. */
const createIntent = jest.fn();
const retrieveIntent = jest.fn();
const confirmIntent = jest.fn();
jest.mock('../infrastructure/gateway.provider', () => ({
  paymentGateway: {
    createIntent: (...a: unknown[]) => createIntent(...a),
    retrieveIntent: (...a: unknown[]) => retrieveIntent(...a),
    confirmIntent: (...a: unknown[]) => confirmIntent(...a),
  },
}));

import { paymentService } from './payment.service';
import { PaymentModel } from '../infrastructure/payment.model';
import { PaymentMethodModel } from '../infrastructure/payment-method.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  [createIntent, retrieveIntent, confirmIntent].forEach((m) => m.mockReset());
  createIntent.mockResolvedValue({ intentId: 'pi_1', clientSecret: 'sec_1', status: 'requires_payment_method' });
  retrieveIntent.mockResolvedValue({ intentId: 'pi_1', clientSecret: 'sec_1', status: 'requires_payment_method' });
});

const usd = (amount: number) => ({ amount, currency: 'USD' });
const charge = (anyMethod: boolean) =>
  paymentService.chargeForBooking({
    bookingId: 'b1', guestId: 'g1', hostId: 'h1', capture: true, total: usd(10_000), hostEarnings: usd(8_000), commission: usd(1_500), tax: usd(500),
    idempotencyKey: 'k1', anyMethod,
  });

describe('pay on the page', () => {
  it('asks Stripe for every method, does not attach the saved card, and records nothing as paid', async () => {
    await PaymentMethodModel.create({ userId: 'g1', brand: 'visa', last4: '4242', expMonth: 1, expYear: 2030, isDefault: true, stripePaymentMethodId: 'pm_saved' });
    const r = await charge(true);
    expect(createIntent).toHaveBeenCalledWith(expect.objectContaining({ anyMethod: true, paymentMethodId: undefined }));
    expect(r.status).toBe('pending');
    expect(r.clientSecret).toBe('sec_1');
    expect((await PaymentModel.findOne({ bookingId: 'b1' }).lean())?.onPage).toBe(true);
  });

  it('resuming never charges the saved card behind the guest’s back, and hands back checkout', async () => {
    await PaymentMethodModel.create({ userId: 'g1', brand: 'visa', last4: '4242', expMonth: 1, expYear: 2030, isDefault: true, stripePaymentMethodId: 'pm_saved' });
    await charge(true);
    const r = await paymentService.resume('b1');
    expect(confirmIntent).not.toHaveBeenCalled();
    expect(r).toEqual({ status: 'requires_payment_method', clientSecret: 'sec_1' });
  });

  it('once Stripe reports the money, the payment is recorded as paid', async () => {
    await charge(true);
    retrieveIntent.mockResolvedValue({ intentId: 'pi_1', clientSecret: 'sec_1', status: 'succeeded' });
    expect(await paymentService.resume('b1')).toEqual({ status: 'succeeded' });
    expect((await PaymentModel.findOne({ bookingId: 'b1' }).lean())?.status).toBe('succeeded');
  });
});
