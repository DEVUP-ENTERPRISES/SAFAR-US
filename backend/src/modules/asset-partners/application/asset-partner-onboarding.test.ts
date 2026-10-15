jest.mock('../../notifications/application/notification.service', () => ({ notificationService: { send: jest.fn(async () => undefined) } }));
jest.mock('../../vehicles/application/vin-decode.service', () => ({
  vinDecodeService: {
    decodeBatch: jest.fn(async (vins: string[]) => vins.map((vin) => ({ vin, ok: true, year: 2024, make: 'BMW', model: '5 Series', trim: '530i' }))),
  },
}));

import { assetPartnerApplicationService } from './asset-partner-application.service';
import { assetPartnerService } from './asset-partner.service';
import { assetPartnerAgreementService } from './asset-partner-agreement.service';
import { AssetPartnerModel } from '../infrastructure/asset-partner.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';
import type { PortalApplicationDto } from '../dto/asset-partner-application.schemas';
import { notificationService } from '../../notifications/application/notification.service';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

const OPS = 'house-fleet-1';
const AGREEMENT = { title: 'Asset Partner Agreement', body: 'The partner places the vehicle with CatoDrive, which manages and rents it out on these terms.' };

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

  it('keeps the dashboard locked until the agreement is signed and payout details are in', async () => {
    const userId = await approvedApplicant();
    expect(notificationService.send).toHaveBeenLastCalledWith(expect.objectContaining({ userId, templateKey: 'account.asset_partner_application_approved' }));
    expect(await assetPartnerApplicationService.onboarding(userId)).toMatchObject({ stage: 'agreement', agreement: null });
    await expect(assetPartnerService.requirePortalReady(userId)).rejects.toThrow('Finish getting started');

    const partner = (await assetPartnerService.getByUserId(userId))!;
    await expect(assetPartnerAgreementService.sign(partner, { version: 1, signedName: 'Jordan Ramirez' }, {})).rejects.toThrow('still being prepared');
    const v1 = await assetPartnerAgreementService.publish(OPS, AGREEMENT);
    await assetPartnerAgreementService.publish(OPS, { ...AGREEMENT, body: `${AGREEMENT.body} Revised.` });
    await expect(assetPartnerAgreementService.sign(partner, { version: v1.version, signedName: 'Jordan Ramirez' }, {})).rejects.toThrow('updated');

    const signed = await assetPartnerAgreementService.sign(partner, { version: 2, signedName: '  Jordan   Ramirez ' }, { ip: '203.0.113.9' });
    expect(signed.agreement).toMatchObject({ version: 2, signedName: 'Jordan Ramirez', ip: '203.0.113.9' });
    expect(signed.agreement?.bodyHash).toHaveLength(64);

    expect(await assetPartnerApplicationService.onboarding(userId)).toMatchObject({ stage: 'payout', payoutMethod: 'check' });
    await assetPartnerService.setPayoutDetails(userId, { mailingAddress: '1 Main St, Dallas TX 75201' });
    expect((await assetPartnerApplicationService.onboarding(userId)).stage).toBe('ready');
    await expect(assetPartnerService.requirePortalReady(userId)).resolves.toBeTruthy();

    // A later version never rewrites what was signed.
    await assetPartnerAgreementService.publish(OPS, { ...AGREEMENT, body: `${AGREEMENT.body} Third.` });
    expect((await AssetPartnerModel.findOne({ userId }).lean())?.agreement?.version).toBe(2);
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
