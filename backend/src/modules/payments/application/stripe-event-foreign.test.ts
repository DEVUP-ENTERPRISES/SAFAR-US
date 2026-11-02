jest.mock('../infrastructure/gateway.provider', () => ({ paymentGateway: new (jest.requireActual('../infrastructure/mock.gateway').MockGateway)() }));

import { runStripeEvent } from './stripe-event.handler';
import { paymentService } from './payment.service';
import { WebhookEventModel } from '../infrastructure/webhook-event.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

describe('a Stripe account shared with another system', () => {
  it('skips a payment tagged for another system and marks the event done', async () => {
    const spy = jest.spyOn(paymentService, 'recordIntentSucceeded');
    await WebhookEventModel.create({ _id: 'evt_x', type: 'payment_intent.succeeded' });
    await runStripeEvent({ id: 'evt_x', type: 'payment_intent.succeeded', data: { object: { id: 'pi_x', metadata: { app: 'crosscubes', bookingId: 'b1', userId: 'u1' } } } });
    expect(spy).not.toHaveBeenCalled();
    expect((await WebhookEventModel.findById('evt_x').lean())!.status).toBe('processed');
  });
});
