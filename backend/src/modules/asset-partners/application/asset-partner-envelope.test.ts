jest.mock('../../notifications/application/notification.service', () => ({ notificationService: { send: jest.fn(async () => undefined) } }));
jest.mock('../../vehicles/application/vin-decode.service', () => ({
  vinDecodeService: { decodeBatch: jest.fn(async (vins: string[]) => vins.map((vin) => ({ vin, ok: true, year: 2024, make: 'BMW', model: '5 Series' }))) },
}));

import { assetPartnerApplicationService } from './asset-partner-application.service';
import { assetPartnerService } from './asset-partner.service';
import { assetPartnerAgreementService, type SignInput } from './asset-partner-agreement.service';
import { assetPartnerEnvelopeService, sha256 } from './asset-partner-envelope.service';
import { assetPartnerAmendmentService } from './asset-partner-amendment.service';
import { assetPartnerTermsService } from './asset-partner-terms.service';
import { assetPartnerStatementService } from './asset-partner-statement.service';
import { AssetPartnerModel, type AssetPartnerDoc } from '../infrastructure/asset-partner.model';
import { SignatureEnvelopeModel, SignedDocumentModel, SigningEventModel } from '../infrastructure/signature-envelope.model';
import { AssetPartnerTermsVersionModel } from '../infrastructure/asset-partner-terms.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { KycModel } from '../../kyc/infrastructure/kyc.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';
import type { PortalApplicationDto } from '../dto/asset-partner-application.schemas';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

const OPS = 'ops-1';
const ctx = { ip: '203.0.113.9', userAgent: 'Jest' };
const SIGN: SignInput = {
  agreementVersion: 1, ndaVersion: 2, signedName: 'Jordan Ramirez', licenceNumber: 'D12345678', licenceState: 'tx',
  payout: { method: 'zelle', zelleHandle: 'jordan@example.com', zelleName: 'Jordan Ramirez' },
};

function dto(): PortalApplicationDto {
  return {
    fullName: 'Jordan Ramirez', partnerType: 'individual', phone: '2145550142', address: '1 Main St', city: 'Dallas', state: 'TX', zip: '75201',
    vehicle: { year: '2024', make: 'BMW', model: '5 Series', mileage: 18400, vin: '1HGCM82633A004352', plate: 'ABC-1234' },
    ownership: 'owned', accident: 'no', smokeFree: 'yes', petFree: 'yes',
    insurance: { carrier: 'State Farm', policyNumber: 'SF-123', coverageType: 'full' }, availability: 'fulltime',
    acknowledgedAccurate: true, acknowledgedInspection: true, acknowledgedTerms: true, signature: 'Jordan Ramirez', signDate: new Date(),
  } as PortalApplicationDto;
}

async function approvedPartner(): Promise<AssetPartnerDoc> {
  const user = await UserModel.create({ email: 'jordan@example.com', roles: ['guest'], emailVerified: true });
  const app = await assetPartnerApplicationService.createForAccount(String(user._id), dto(), {});
  await assetPartnerApplicationService.review(app._id, OPS, 'approved');
  await assetPartnerAgreementService.publish(OPS, { title: 'Asset Partner Agreement', body: 'CatoDrive manages the {{vehicle}} owned by {{partner_name}} for a management fee of {{management_fee}} of gross revenue, with insurance at {{insurance_monthly}} per car per month.' });
  await assetPartnerAgreementService.publish(OPS, { kind: 'nda', title: 'Non-Disclosure Agreement', body: 'The recipient keeps CatoDrive’s confidential information private for three years. Signed by {{signed_name}}.' });
  await readyToSign(String(user._id));
  return (await assetPartnerService.getByUserId(String(user._id)))!;
}

async function readyToSign(userId: string): Promise<void> {
  await AssetPartnerModel.updateOne({ userId }, { $set: { profile: { emergencyContacts: [{ name: 'Ana Ramirez', phone: '2145550199', relation: 'Sister' }], residency: 'citizen', completedAt: new Date() } } });
  await KycModel.create({ userId, status: 'approved', provider: 'stripe', verifiedFirstName: 'Jordan', verifiedLastName: 'Ramirez' });
}


async function signed(): Promise<AssetPartnerDoc> {
  const partner = await approvedPartner();
  await assetPartnerEnvelopeService.recordEvent(partner._id, 'onboarding', 'opened', ctx);
  await assetPartnerEnvelopeService.recordEvent(partner._id, 'onboarding', 'read_agreement', ctx);
  return assetPartnerAgreementService.sign(partner, SIGN, ctx);
}

describe('sealing at signing', () => {
  it('gives the signing an envelope with its own document IDs, the partner’s own rate in the text, and the history', async () => {
    const partner = await signed();
    const [env] = await assetPartnerEnvelopeService.list(partner._id);
    expect(env.envelopeId).toMatch(/^CD-ENV-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(env.documents.map((d) => d.kind)).toEqual(['agreement', 'nda']);
    expect(env.documents.every((d) => /^CD-DOC-/.test(d.documentId))).toBe(true);
    const types = env.events.map((e) => e.type);
    expect(types.slice(-3)).toEqual(['signed', 'countersigned', 'completed']);
    expect(new Set(types.slice(0, -3))).toEqual(new Set(['sent', 'opened', 'read_agreement']));
    expect(env.signer).toMatchObject({ name: 'Jordan Ramirez', ip: '203.0.113.9' });
    expect(partner.agreement?.envelopeId).toBe(env.envelopeId);

    const full = await SignatureEnvelopeModel.findOne({ envelopeId: env.envelopeId }).lean();
    expect(full?.documents[0].text).toContain('management fee of 20%');
    expect(full?.documents[0].textHash).toBe(sha256(full!.documents[0].text));
  });

  it('stores each PDF once and serves exactly those bytes', async () => {
    const partner = await signed();
    const [env] = await assetPartnerEnvelopeService.list(partner._id);
    const { pdf } = await assetPartnerEnvelopeService.pdf(env.documents[0].documentId, partner._id);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(sha256(pdf)).toBe(env.documents[0].pdfHash);
    expect(await SignedDocumentModel.countDocuments({ envelopeId: env.envelopeId })).toBe(2);
  });

  it('records cannot be changed or deleted through the application', async () => {
    const partner = await signed();
    await expect(SignatureEnvelopeModel.updateOne({ partnerId: partner._id }, { $set: { 'signer.name': 'Someone Else' } })).rejects.toThrow('cannot be changed');
    await expect(SignedDocumentModel.deleteMany({})).rejects.toThrow('cannot be changed');
    await expect(SigningEventModel.deleteMany({})).rejects.toThrow('cannot be changed');
  });

  it('refuses a stored PDF whose bytes no longer match, and rebuilds a missing one exactly', async () => {
    const partner = await signed();
    const [env] = await assetPartnerEnvelopeService.list(partner._id);
    const [agreement, nda] = env.documents;

    await SignedDocumentModel.collection.deleteOne({ documentId: nda.documentId });
    const rebuilt = await assetPartnerEnvelopeService.pdf(nda.documentId, partner._id);
    expect(sha256(rebuilt.pdf)).toBe(nda.pdfHash);

    await SignedDocumentModel.collection.updateOne({ documentId: agreement.documentId }, { $set: { bytes: Buffer.from('%PDF-forged') } });
    await expect(assetPartnerEnvelopeService.pdf(agreement.documentId, partner._id)).rejects.toThrow('can’t be opened');
  });

  it('a double tap seals once', async () => {
    const partner = await approvedPartner();
    await Promise.allSettled([assetPartnerAgreementService.sign(partner, SIGN, ctx), assetPartnerAgreementService.sign(partner, SIGN, ctx)]);
    expect(await SignatureEnvelopeModel.countDocuments({ partnerId: partner._id })).toBe(1);
  });

  it('another partner cannot open someone else’s document', async () => {
    const partner = await signed();
    const [env] = await assetPartnerEnvelopeService.list(partner._id);
    await expect(assetPartnerEnvelopeService.pdf(env.documents[0].documentId, 'someone-else')).rejects.toThrow();
  });

  it('seals a signature made before envelopes existed, the first time it is opened', async () => {
    const partner = await signed();
    await SignatureEnvelopeModel.collection.deleteMany({});
    await SignedDocumentModel.collection.deleteMany({});
    await AssetPartnerModel.updateOne({ _id: partner._id }, { $unset: { 'agreement.envelopeId': 1, 'nda.envelopeId': 1 } });
    const old = (await assetPartnerService.getById(partner._id))!;
    const { pdf } = await assetPartnerAgreementService.signedPdf(old, 'agreement');
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    const [env] = await assetPartnerEnvelopeService.list(partner._id);
    expect(env.events[0]).toMatchObject({ type: 'signed', detail: 'sealed from the original signing record' });
    expect((await assetPartnerService.getById(partner._id))?.agreement?.envelopeId).toBe(env.envelopeId);
  });
});

describe('public check', () => {
  it('confirms an envelope and a file with initials only', async () => {
    const partner = await signed();
    const [env] = await assetPartnerEnvelopeService.list(partner._id);
    const v = await assetPartnerEnvelopeService.verify(env.envelopeId);
    expect(v).toMatchObject({ valid: true, envelope: { signer: 'J. R.' } });
    expect(JSON.stringify(v)).not.toContain('jordan@example.com');
    const byFile = await assetPartnerEnvelopeService.verifyFile(env.documents[1].pdfHash);
    expect(byFile).toMatchObject({ valid: true, documentId: env.documents[1].documentId });
    expect((await assetPartnerEnvelopeService.verify('CD-ENV-2222-2222')).valid).toBe(false);
  });
});

describe('per-partner terms', () => {
  it('before signing, staff set the draft; after signing, money terms only change by a signed amendment', async () => {
    const partner = await approvedPartner();
    await assetPartnerService.setTerms(partner._id, { managementFeeBps: 2500 });
    const after = await assetPartnerAgreementService.sign((await assetPartnerService.getById(partner._id))!, SIGN, ctx);
    const env = await SignatureEnvelopeModel.findOne({ partnerId: after._id }).lean();
    expect(env?.documents[0].text).toContain('management fee of 25%');
    expect((await assetPartnerService.termsFor(after)).managementFeeBps).toBe(2500);
    await expect(assetPartnerService.setTerms(after._id, { managementFeeBps: 3000 })).rejects.toThrow('signed');
  });

  it('a change waits for the partner, applies only from when they sign, and never rewrites earlier trips', async () => {
    const partner = await signed();
    const version = await assetPartnerAmendmentService.request(partner._id, { managementFeeBps: 3000 }, { actorId: OPS, reason: 'Premium fleet' });
    expect(version.status).toBe('pending_signature');
    await expect(assetPartnerAmendmentService.request(partner._id, { managementFeeBps: 2500 }, { actorId: OPS })).rejects.toThrow('already waiting');
    expect((await assetPartnerService.termsFor(partner)).managementFeeBps).toBe(2000);

    const view = await assetPartnerAmendmentService.forPartner(partner);
    expect(view?.body).toContain('Management fee: 20% -> 30%');
    const before = new Date(Date.now() - 60_000);
    const res = await assetPartnerAmendmentService.sign(partner, { versionId: version._id, signedName: 'Jordan Ramirez', templateVersion: view!.version }, ctx);
    expect(res.envelopeId).toMatch(/^CD-ENV-/);
    expect((await assetPartnerService.termsFor(partner)).managementFeeBps).toBe(3000);
    expect((await assetPartnerService.termsFor(partner, before)).managementFeeBps).toBe(2000);
    expect(await SignatureEnvelopeModel.countDocuments({ partnerId: partner._id })).toBe(2);
  });

  it('refuses a start date in the past, and a declined change leaves the terms alone', async () => {
    const partner = await signed();
    await expect(assetPartnerAmendmentService.request(partner._id, { managementFeeBps: 2500 }, { actorId: OPS, requestedFrom: new Date(Date.now() - 3 * 86_400_000) })).rejects.toThrow('never in the past');
    await assetPartnerAmendmentService.request(partner._id, { managementFeeBps: 2500 }, { actorId: OPS });
    await assetPartnerAmendmentService.decline(partner, ctx);
    expect((await AssetPartnerTermsVersionModel.findOne({ kind: 'amendment' }).lean())?.status).toBe('declined');
    expect((await assetPartnerService.termsFor(partner)).managementFeeBps).toBe(2000);
  });

  it('a later change to the platform default does not reach a partner who signed', async () => {
    const partner = await signed();
    const { platformConfigService } = await import('../../platform-config/application/platform-config.service');
    await platformConfigService.update({ assetPartner: { managementFeeBps: 3500 } }, OPS, 'test');
    try {
      expect((await assetPartnerService.termsFor(partner)).managementFeeBps).toBe(2000);
    } finally {
      await platformConfigService.update({ assetPartner: { managementFeeBps: 2000 } }, OPS, 'test');
    }
  });

  it('a statement charges each trip at the rate in force on the day it ended', async () => {
    const partner = await signed();
    const signedAt = new Date(partner.agreement!.signedAt);
    // A rate change effective in the future is applied by moving its start date for the test.
    const v = await assetPartnerAmendmentService.request(partner._id, { managementFeeBps: 3000 }, { actorId: OPS });
    const view = await assetPartnerAmendmentService.forPartner(partner);
    await assetPartnerAmendmentService.sign(partner, { versionId: v._id, signedName: 'Jordan Ramirez', templateVersion: view!.version }, ctx);
    const changeAt = new Date(signedAt.getTime() + 2 * 3_600_000);
    await AssetPartnerTermsVersionModel.collection.updateOne({ _id: v._id } as never, { $set: { effectiveFrom: changeAt } });

    const vehicle = await VehicleModel.collection.insertOne({ _id: 'car-1', assetPartnerId: partner._id, year: 2024, make: 'BMW', model: '5 Series', createdAt: new Date(signedAt.getTime() - 86_400_000) } as never);
    const trip = (id: string, end: Date) => ({
      _id: id, code: id, guestId: 'g', hostId: 'h', vehicleId: vehicle.insertedId, status: 'completed', statusHistory: [], instantBook: true,
      period: { start: new Date(end.getTime() - 3_600_000), end }, priceBreakdown: { subtotal: { amount: 10_000, currency: 'USD' }, total: { amount: 10_000, currency: 'USD' } },
    });
    await BookingModel.collection.insertMany([trip('t-before', new Date(signedAt.getTime() + 3_600_000)), trip('t-after', new Date(signedAt.getTime() + 3 * 3_600_000))] as never[]);

    const period = `${signedAt.getUTCFullYear()}-${String(signedAt.getUTCMonth() + 1).padStart(2, '0')}`;
    const s = await assetPartnerStatementService.statement((await assetPartnerService.getById(partner._id))!, period);
    expect(s.totals.managementFee).toBe(2_000 + 3_000);
    expect(s.managementFeeBpsUsed).toEqual([2000, 3000]);
  });

  it('keeps one history per partner, newest first', async () => {
    const partner = await signed();
    await assetPartnerAmendmentService.request(partner._id, { detailingMonthlyCents: 6_000 }, { actorId: OPS });
    await assetPartnerTermsService.close(partner._id, 'cancelled', OPS);
    const history = await assetPartnerTermsService.history(partner._id);
    expect(history.map((h) => [h.kind, h.status])).toEqual([['amendment', 'cancelled'], ['baseline', 'active']]);
  });
});
