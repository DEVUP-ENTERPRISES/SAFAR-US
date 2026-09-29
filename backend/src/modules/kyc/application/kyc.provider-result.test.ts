const emitted: string[] = [];
jest.mock('../../../shared/events/event-bus', () => ({
  emit: (name: string) => emitted.push(name),
  eventBus: { subscribe: jest.fn() },
}));

import { kycService } from './kyc.service';
import { KycModel } from '../infrastructure/kyc.model';
import { EVENTS } from '../../../core/events/event-names';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  emitted.length = 0;
});

const pending = (userId: string) => KycModel.collection.insertOne({ userId, status: 'pending', provider: 'stripe', providerSessionId: 's1' } as never);
const statusOf = async (userId: string) => (await KycModel.findOne({ userId }).lean())!.status;

describe('identity provider results never cancel bookings on their own', () => {
  it('a closed or abandoned check goes back to not started, and no rejection is emitted', async () => {
    await pending('u1');
    await kycService.applyProviderResult('u1', { status: 'rejected', reason: 'consent_declined' });
    expect(await statusOf('u1')).toBe('not_started');
    expect(emitted).toEqual([EVENTS.KYC_ATTEMPT_FAILED]);
  });

  it('a failed document is a retryable attempt, not a rejection', async () => {
    await pending('u2');
    await kycService.applyProviderResult('u2', { status: 'rejected', reason: 'document_unverified_other' });
    expect(await statusOf('u2')).toBe('rejected');
    expect(emitted).toEqual([EVENTS.KYC_ATTEMPT_FAILED]);
    expect(emitted).not.toContain(EVENTS.KYC_REJECTED);
  });

  it('a late failure event never undoes an approval', async () => {
    await KycModel.collection.insertOne({ userId: 'u3', status: 'approved' } as never);
    await kycService.applyProviderResult('u3', { status: 'rejected', reason: 'abandoned' });
    expect(await statusOf('u3')).toBe('approved');
    expect(emitted).toEqual([]);
  });

  it('a pass still approves and releases held bookings', async () => {
    await pending('u4');
    await kycService.applyProviderResult('u4', { status: 'verified' });
    expect(await statusOf('u4')).toBe('approved');
    expect(emitted).toEqual([EVENTS.KYC_APPROVED]);
  });
});
