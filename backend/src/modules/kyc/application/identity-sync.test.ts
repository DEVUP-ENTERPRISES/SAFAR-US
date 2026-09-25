/**
 * The backup for an identity webhook that never arrived: a pending check is
 * resolved by asking the provider. The provider is mocked; nothing here can
 * reach Stripe.
 */
const retrieve = jest.fn();
jest.mock('../infrastructure/identity.provider', () => ({
  identityProvider: { kind: 'stripe', retrieve: (...a: unknown[]) => retrieve(...a), createSession: jest.fn(), parseEvent: jest.fn() },
}));

import { kycService } from './kyc.service';
import { KycModel } from '../infrastructure/kyc.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  retrieve.mockReset();
});

const pending = (userId: string) =>
  KycModel.create({ userId, status: 'pending', provider: 'stripe', providerSessionId: `vs_${userId}` });

describe('identity status sync', () => {
  it('approves a guest whose result Stripe has but the webhook never delivered, and keeps what was verified', async () => {
    await pending('u1');
    retrieve.mockResolvedValue({
      userId: 'u1',
      result: { status: 'verified', firstName: 'Mohammed', lastName: 'Ali', dob: '2006-05-19', licenceExpiry: '2030-01-01' },
    });

    expect(await kycService.syncPending('u1')).toBe(true);

    const k = await KycModel.findOne({ userId: 'u1' }).lean();
    expect(k?.status).toBe('approved');
    expect(k?.verifiedFirstName).toBe('Mohammed');
    expect(k?.verifiedLastName).toBe('Ali');
    expect(k?.licenceExpiry?.toISOString().slice(0, 10)).toBe('2030-01-01');
  });

  it('records a rejection with its reason', async () => {
    await pending('u1');
    retrieve.mockResolvedValue({ userId: 'u1', result: { status: 'rejected', reason: 'document_expired' } });

    await kycService.syncPending('u1');

    const k = await KycModel.findOne({ userId: 'u1' }).lean();
    expect(k?.status).toBe('rejected');
    expect(k?.rejectionReason).toBe('document_expired');
  });

  it('does nothing while the provider has not decided', async () => {
    await pending('u1');
    retrieve.mockResolvedValue(null);

    expect(await kycService.syncPending('u1')).toBe(false);
    expect((await KycModel.findOne({ userId: 'u1' }).lean())?.status).toBe('pending');
  });

  it('never touches a check that is already decided', async () => {
    await KycModel.create({ userId: 'u1', status: 'approved', provider: 'stripe', providerSessionId: 'vs_u1' });

    expect(await kycService.syncPending('u1')).toBe(false);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('the sweep resolves stale checks and survives one provider error', async () => {
    await pending('bad');
    await pending('good');
    retrieve.mockImplementation(async (sessionId: string) => {
      if (sessionId === 'vs_bad') throw new Error('stripe down');
      return { userId: 'good', result: { status: 'verified' } };
    });

    expect(await kycService.syncStalePending(0)).toBe(1);
    expect((await KycModel.findOne({ userId: 'good' }).lean())?.status).toBe('approved');
    expect((await KycModel.findOne({ userId: 'bad' }).lean())?.status).toBe('pending');
  });
});
