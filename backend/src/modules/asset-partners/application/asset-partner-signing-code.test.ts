jest.mock('../../notifications/infrastructure/channel.providers', () => ({ channelProviders: { email: { send: jest.fn(async () => ({ ok: true })) } } }));

import { assetPartnerSigningCode } from './asset-partner-signing-code';
import { assetPartnerService } from './asset-partner.service';
import { assetPartnerEnvelopeService } from './asset-partner-envelope.service';
import { UserModel } from '../../users/infrastructure/user.model';
import { KycModel } from '../../kyc/infrastructure/kyc.model';
import { assetPartnerAgreementService } from './asset-partner-agreement.service';
import { channelProviders } from '../../notifications/infrastructure/channel.providers';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

async function partner() {
  await UserModel.create({ _id: 'u-sign', email: 'Jordan@Example.com', roles: ['guest'], status: 'active' });
  return assetPartnerService.enrol({ userId: 'u-sign', hostId: 'h-1', partnerType: 'individual', displayName: 'Jordan Ramirez' });
}

describe('signing with an emailed one-time code', () => {
  it('emails a code to the account address, refuses a wrong one, and accepts the right one once', async () => {
    const p = await partner();
    const sent = await assetPartnerSigningCode.send(p);
    expect(sent.sentTo).toMatch(/^j.+@example\.com$/);
    expect(sent.devCode).toMatch(/^\d{6}$/);
    expect(channelProviders.email.send).toHaveBeenCalledWith(expect.objectContaining({ target: expect.objectContaining({ email: 'jordan@example.com' }) }));

    const wrong = sent.devCode === '000000' ? '111111' : '000000';
    await expect(assetPartnerSigningCode.verify(p, wrong)).rejects.toThrow();
    await expect(assetPartnerSigningCode.verify(p, '12')).rejects.toThrow('6-digit code');
    expect(await assetPartnerSigningCode.verify(p, sent.devCode)).toBe('jordan@example.com');
    await expect(assetPartnerSigningCode.verify(p, sent.devCode)).rejects.toThrow();
  });

  it('records the email check in the sealed signing history', async () => {
    const p = await partner();
    const at = new Date();
    const env = await assetPartnerEnvelopeService.seal({
      partner: p,
      purpose: 'amendment',
      termsVersionId: 'tv-1',
      docs: [{ kind: 'amendment', title: 'Amendment', version: 1, text: 'New management fee 25%.' }],
      signerName: 'Jordan Ramirez',
      signerEmail: 'jordan@example.com',
      ctx: { ip: '203.0.113.9', userAgent: 'Jest' },
      at,
      authenticated: { at, email: 'jordan@example.com' },
    });
    const types = env.events.map((e) => e.type);
    expect(types.indexOf('authenticated')).toBeGreaterThanOrEqual(0);
    expect(types.indexOf('authenticated')).toBeLessThan(types.indexOf('signed'));
  });
});

describe('the signing page asks only what it doesn’t know', () => {
  it('takes the legal name and licence from the ID check', async () => {
    const p = await partner();
    await KycModel.create({ userId: 'u-sign', status: 'approved', provider: 'stripe', verifiedFirstName: 'Jordan', verifiedLastName: 'Ramirez', licenceLast4: '5678' });
    const f = await assetPartnerAgreementService.prefill(p);
    expect(f).toMatchObject({ signer_name: 'Jordan Ramirez', licence_last4: '5678' });
  });
});
