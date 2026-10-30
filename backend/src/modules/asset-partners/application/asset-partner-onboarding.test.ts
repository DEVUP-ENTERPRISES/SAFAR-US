jest.mock('../../notifications/application/notification.service', () => ({ notificationService: { send: jest.fn(async () => undefined) } }));
jest.mock('../../vehicles/application/vin-decode.service', () => ({
  vinDecodeService: {
    decodeBatch: jest.fn(async (vins: string[]) => vins.map((vin) => ({ vin, ok: true, year: 2024, make: 'BMW', model: '5 Series', trim: '530i' }))),
  },
}));

import { assetPartnerApplicationService } from './asset-partner-application.service';
import { assetPartnerService } from './asset-partner.service';
import { assetPartnerAgreementService, type SignInput } from './asset-partner-agreement.service';
import { DocumentModel } from '../../documents/infrastructure/document.model';
import { AssetPartnerModel } from '../infrastructure/asset-partner.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { KycModel } from '../../kyc/infrastructure/kyc.model';
import { assetPartnerProfileService } from './asset-partner-profile.service';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';
import type { PortalApplicationDto } from '../dto/asset-partner-application.schemas';
import { notificationService } from '../../notifications/application/notification.service';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

const OPS = 'house-fleet-1';
const AGREEMENT = { title: 'Asset Partner Agreement', body: 'The partner places the vehicle with CatoDrive, which manages and rents it out on these terms.\nVehicle: {{vehicle}}, VIN {{vin}}, owned by {{partner_name}}.\nLicence: {{licence}}' };
const NDA = { kind: 'nda' as const, title: 'Non-Disclosure Agreement', body: 'The recipient keeps CatoDrive’s confidential information private for three years. Signed by {{signed_name}}.' };
const SIGN: SignInput = {
  agreementVersion: 1, ndaVersion: 2, signedName: 'Jordan Ramirez', licenceNumber: 'D12345678', licenceState: 'tx',
  payout: { method: 'zelle', zelleHandle: 'jordan@example.com', zelleName: 'Jordan Ramirez' },
};

function dto(vin = '1HGCM82633A004352'): PortalApplicationDto {
  return {
    fullName: 'Jordan Ramirez',
    partnerType: 'individual',
    phone: '2145550142',
    address: '1 Main St',
    city: 'Dallas',
    state: 'TX',
    zip: '75201',
    vehicle: { year: '2024', make: 'BMW', model: '5 Series', mileage: 18400, vin, plate: 'ABC-1234' },
    ownership: 'owned',
    accident: 'no',
    smokeFree: 'yes',
    petFree: 'yes',
    insurance: { carrier: 'State Farm', policyNumber: 'SF-123', coverageType: 'full' },
    availability: 'fulltime',
    acknowledgedAccurate: true,
    acknowledgedInspection: true,
    acknowledgedTerms: true,
    signature: 'Jordan Ramirez',
    signDate: new Date(),
  } as PortalApplicationDto;
}

async function account(emailVerified = true) {
  const user = await UserModel.create({ email: 'jordan@example.com', roles: ['guest'], emailVerified });
  return String(user._id);
}

async function approvedApplicant() {
  const userId = await account();
  const app = await assetPartnerApplicationService.createForAccount(userId, dto(), {});
  await assetPartnerApplicationService.review(app._id, OPS, 'approved');
  return userId;
}

describe('getting started on the partner portal', () => {
  it('asks for the email code before anything else', async () => {
    const userId = await account(false);
    expect((await assetPartnerApplicationService.onboarding(userId)).stage).toBe('verify_email');
    await expect(assetPartnerApplicationService.createForAccount(userId, dto(), {})).rejects.toThrow('Confirm your email');
  });

  it('takes one application, uses the account email, and waits for review', async () => {
    const userId = await account();
    expect((await assetPartnerApplicationService.onboarding(userId)).stage).toBe('apply');
    const app = await assetPartnerApplicationService.createForAccount(userId, dto(), {});
    expect(app).toMatchObject({ kind: 'partner', email: 'jordan@example.com', submittedByUserId: userId });
    expect((await assetPartnerApplicationService.onboarding(userId)).stage).toBe('review');
    await expect(assetPartnerApplicationService.createForAccount(userId, dto(), {})).rejects.toThrow('already have an application');
  });

  it('sends an application back for changes and takes the corrected one', async () => {
    const userId = await account();
    const app = await assetPartnerApplicationService.createForAccount(userId, dto(), {});
    await expect(assetPartnerApplicationService.review(app._id, OPS, 'changes_requested')).rejects.toThrow('Add a note');
    await assetPartnerApplicationService.review(app._id, OPS, 'changes_requested', 'Upload the title photo');
    const stage = await assetPartnerApplicationService.onboarding(userId);
    expect(stage).toMatchObject({ stage: 'changes', application: { reviewNotes: 'Upload the title photo' } });
    const fixed = await assetPartnerApplicationService.resubmit(userId, app._id, { ...dto(), notes: 'Title attached' });
    expect(fixed).toMatchObject({ status: 'submitted', notes: 'Title attached' });
    await expect(assetPartnerApplicationService.resubmit(userId, app._id, dto())).rejects.toThrow();
    await expect(assetPartnerApplicationService.resubmit('someone-else', app._id, dto())).rejects.toThrow();
  });

  it('signs the NDA and agreement together, fills in the partner, then asks for the papers', async () => {
    const userId = await approvedApplicant();
    expect(notificationService.send).toHaveBeenLastCalledWith(expect.objectContaining({ userId, templateKey: 'account.asset_partner_application_approved' }));
    // Before signing: who to call in an emergency, then a Stripe ID check.
    expect(await assetPartnerApplicationService.onboarding(userId)).toMatchObject({ stage: 'profile', offer: null });
    await assetPartnerProfileService.save(userId, { emergencyContacts: [{ name: 'Ana Ramirez', phone: '(214) 555-0199', relation: 'Sister' }], residency: 'citizen' });
    expect(await assetPartnerApplicationService.onboarding(userId)).toMatchObject({ stage: 'identity', identity: { state: 'not_started' } });
    await KycModel.create({ userId, status: 'approved', provider: 'stripe', verifiedFirstName: 'Jordan', verifiedLastName: 'Ramirez' });
    expect(await assetPartnerApplicationService.onboarding(userId)).toMatchObject({ stage: 'agreement', agreement: null, nda: null });
    await expect(assetPartnerService.requirePortalReady(userId)).rejects.toThrow('Finish getting started');

    const partner = (await assetPartnerService.getByUserId(userId))!;
    const sign = (over: Partial<SignInput> = {}) => assetPartnerAgreementService.sign(partner, { ...SIGN, ...over }, { ip: '203.0.113.9' });
    await expect(sign()).rejects.toThrow('still being prepared');

    const a1 = await assetPartnerAgreementService.publish(OPS, AGREEMENT);
    await expect(sign({ agreementVersion: a1.version })).rejects.toThrow('still being prepared');
    const nda = await assetPartnerAgreementService.publish(OPS, NDA);
    const a2 = await assetPartnerAgreementService.publish(OPS, { ...AGREEMENT, body: `${AGREEMENT.body} Revised.` });
    expect([a1.version, nda.version, a2.version]).toEqual([1, 2, 3]);

    const view = await assetPartnerApplicationService.onboarding(userId);
    expect(view.agreement?.body).toContain('Vehicle: 2024 BMW 5 Series, VIN 1HGCM82633A004352, owned by Jordan Ramirez.');
    expect(view.agreement?.body).toContain('Licence: ________');
    expect(view.nda?.version).toBe(nda.version);

    await expect(sign({ agreementVersion: a1.version, ndaVersion: nda.version })).rejects.toThrow('updated');
    await expect(sign({ agreementVersion: a2.version, ndaVersion: nda.version, licenceState: 'Texas' })).rejects.toThrow('licence');

    const signed = await sign({ agreementVersion: a2.version, ndaVersion: nda.version, signedName: '  Jordan   Ramirez ' });
    expect(signed.agreement).toMatchObject({ version: a2.version, signedName: 'Jordan Ramirez', ip: '203.0.113.9' });
    expect(signed.nda).toMatchObject({ version: nda.version, signedName: 'Jordan Ramirez' });
    expect(signed.agreement?.fields).toMatchObject({ licence: 'TX •••• 5678', payout_method: 'Zelle', zelle_handle: 'jordan@example.com' });
    expect(JSON.stringify(signed)).not.toContain('D12345678');
    expect(signed.payoutDetails).toMatchObject({ method: 'zelle', zelleHandle: 'jordan@example.com', zelleName: 'Jordan Ramirez' });

    const pdf = await assetPartnerAgreementService.signedPdf(signed, 'agreement');
    expect(pdf.pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.filename).toMatch(/^CatoDrive-Asset-Partner-Agreement-Jordan-Ramirez-CD-ENV-[A-Z0-9]{4}-[A-Z0-9]{4}.pdf$/);

    const docsStep = await assetPartnerApplicationService.onboarding(userId);
    expect(docsStep.stage).toBe('documents');
    expect(docsStep.documents?.map((d) => d.category)).toEqual(['w9', 'kyc', 'title', 'insurance', 'registration']);
    await expect(assetPartnerService.requirePortalReady(userId)).rejects.toThrow('Finish getting started');

    for (const category of ['w9', 'kyc', 'title', 'insurance', 'registration']) {
      await DocumentModel.create({ ownerId: userId, category, url: `https://cdn.example.com/${category}.pdf` });
    }
    expect((await assetPartnerApplicationService.onboarding(userId)).stage).toBe('ready');
    await expect(assetPartnerService.requirePortalReady(userId)).resolves.toBeTruthy();

    // A paper CatoDrive sends back locks the dashboard again until it is replaced.
    await DocumentModel.updateOne({ ownerId: userId, category: 'w9' }, { $set: { verification: { status: 'rejected', reason: 'Unsigned' } } });
    expect((await assetPartnerApplicationService.onboarding(userId)).stage).toBe('documents');

    // A later version never rewrites what was signed.
    await assetPartnerAgreementService.publish(OPS, { ...AGREEMENT, body: `${AGREEMENT.body} Third.` });
    expect((await AssetPartnerModel.findOne({ userId }).lean())?.agreement?.version).toBe(a2.version);
  });

  it('pays by the method the partner chose unless ops set one', async () => {
    const userId = await approvedApplicant();
    await assetPartnerAgreementService.publish(OPS, AGREEMENT);
    await assetPartnerAgreementService.publish(OPS, NDA);
    await assetPartnerProfileService.save(userId, { emergencyContacts: [{ name: 'Ana Ramirez', phone: '2145550199', relation: 'Sister' }], residency: 'citizen' });
    await KycModel.create({ userId, status: 'approved', provider: 'stripe' });
    const partner = (await assetPartnerService.getByUserId(userId))!;
    const signed = await assetPartnerAgreementService.sign(partner, { ...SIGN, agreementVersion: 1, ndaVersion: 2, payout: { method: 'check', payableTo: 'Jordan Ramirez', mailingAddress: '1 Main St, Dallas TX 75201' } }, {});
    expect((await assetPartnerService.termsFor(signed)).payoutMethod).toBe('check');
    await AssetPartnerModel.updateOne({ userId }, { $set: { 'terms.payoutMethod': 'zelle' } });
    expect((await assetPartnerService.termsFor((await assetPartnerService.getByUserId(userId))!)).payoutMethod).toBe('zelle');
  });

  it('lets a ready partner offer another car without a second membership', async () => {
    const userId = await approvedApplicant();
    await expect(assetPartnerApplicationService.createForAccount(userId, dto('WBA53BJ09RWX12345'), {})).rejects.toThrow('Finish getting started');
    await AssetPartnerModel.updateOne({ userId }, { $set: { agreementRequired: false } });

    const car = await assetPartnerApplicationService.createForAccount(userId, dto('WBA53BJ09RWX12345'), {});
    expect(car.kind).toBe('vehicle');
    await assetPartnerApplicationService.review(car._id, OPS, 'approved');
    expect(await AssetPartnerModel.countDocuments({})).toBe(1);
  });

  it('leaves partners added directly by ops untouched', async () => {
    const { partner } = await assetPartnerService.enrolByEmail({ email: 'owner@example.com', fullName: 'Pat Owner', partnerType: 'individual' });
    expect(await assetPartnerService.portalStage(partner)).toBe('ready');
  });

  it('fills a car from its VIN and spots one already with us', async () => {
    const userId = await account();
    expect(await assetPartnerApplicationService.lookupVin('1hgcm82633a004352')).toMatchObject({ decoded: { make: 'BMW', model: '5 Series' }, alreadyWithUs: false });
    await assetPartnerApplicationService.createForAccount(userId, dto(), {});
    expect((await assetPartnerApplicationService.lookupVin('1HGCM82633A004352')).alreadyWithUs).toBe(true);
  });
});
