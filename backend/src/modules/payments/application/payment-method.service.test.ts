import { paymentMethodService } from './payment-method.service';
import { PaymentMethodModel } from '../infrastructure/payment-method.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  // No live gateway in tests: cards are saved as records only.
  (paymentMethodService as unknown as { stripe: null }).stripe = null;
});

const card = (last4: string) => ({ brand: 'visa', last4, expMonth: 1, expYear: 2030 });

describe('saved cards', () => {
  it('charges the card the guest just added, not the one that was declined', async () => {
    await paymentMethodService.save('g1', card('7546'));
    await paymentMethodService.save('g1', card('3251'));
    const defaults = await PaymentMethodModel.find({ userId: 'g1', isDefault: true }).lean();
    expect(defaults.map((c) => c.last4)).toEqual(['3251']);
  });

  it('leaves other guests’ cards alone', async () => {
    await paymentMethodService.save('g1', card('1111'));
    await paymentMethodService.save('g2', card('2222'));
    expect(await PaymentMethodModel.countDocuments({ isDefault: true })).toBe(2);
  });
});
