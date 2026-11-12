jest.mock('../../notifications/application/notification.service', () => ({ notificationService: { send: jest.fn(async () => undefined) } }));
import { assetPartnerApplicationService } from './asset-partner-application.service';
import { assetPartnerService } from './asset-partner.service';
import { notificationService } from '../../notifications/application/notification.service';
import { UserModel } from '../../users/infrastructure/user.model';
import { DocumentModel } from '../../documents/infrastructure/document.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';
import { createApplicationSchema, signAgreementSchema, type CreateApplicationDto } from '../dto/asset-partner-application.schemas';
import { OWNERSHIP_PAPERS, seasonMonthsAllowed } from '../domain/application-rules';
import { renderEmail } from '../../notifications/infrastructure/email-template';
import { isPartnerEmail } from '../../notifications/infrastructure/channel.providers';
import { config } from '../../../config';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  (notificationService.send as jest.Mock).mockClear();
});

const PHOTOS = [
  { url: 'https://files.example/front.jpg', label: 'Front' },
  { url: 'https://files.example/rear.jpg', label: 'Rear' },
  { url: 'https://files.example/odo.jpg', label: 'Odometer' },
];

function dto(overrides: Partial<CreateApplicationDto> = {}): CreateApplicationDto {
  return {
    fullName: 'Jordan Ramirez', partnerType: 'individual', email: 'jordan@example.com', phone: '2145550142',
    address: '1 Main St', city: 'Dallas', state: 'TX', zip: '75201',
    vehicle: { year: '2024', make: 'BMW', model: '5 Series', mileage: 18400, vin: '1HGCM82633A004352', plate: 'ABC-1234' },
    ownership: 'owned', titleStatus: 'clean', photos: PHOTOS, accident: 'no', availability: 'fulltime',
    acknowledgedAccurate: true, acknowledgedInspection: true, acknowledgedTerms: true,
    signature: 'Jordan Ramirez', signDate: new Date(),
    ...overrides,
  } as CreateApplicationDto;
}

const flush = () => new Promise((r) => setImmediate(r));

describe('application rules', () => {
  it('allows the minimum to six months, or a full year, and nothing else', () => {
    expect([1, 2, 4, 6, 7, 11, 12, 13].map((m) => seasonMonthsAllowed(m, 2))).toEqual([false, true, true, true, false, false, true, false]);
    expect(seasonMonthsAllowed(undefined, 2)).toBe(false);
    expect(seasonMonthsAllowed(2.5, 2)).toBe(false);
  });

  it('refuses a branded title with its reason', async () => {
    await expect(assetPartnerApplicationService.create(dto({ titleStatus: 'salvage' }), {})).rejects.toThrow(/clean title/);
  });

  it('refuses a season shorter than the admin minimum or between six and twelve months', async () => {
    await expect(assetPartnerApplicationService.create(dto({ availability: 'seasonal', seasonMonths: 1 }), {})).rejects.toThrow(/2 to 6 months, or 12/);
    await expect(assetPartnerApplicationService.create(dto({ availability: 'seasonal', seasonMonths: 8 }), {})).rejects.toThrow(/or 12/);
    await expect(assetPartnerApplicationService.create(dto({ availability: 'seasonal' }), {})).rejects.toThrow(/season/);
  });

  it('keeps the season length for a seasonal car and drops it for a full-time one', async () => {
    const seasonal = await assetPartnerApplicationService.create(dto({ availability: 'seasonal', seasonMonths: 12 }), {});
    expect(seasonal.seasonMonths).toBe(12);
    const fulltime = await assetPartnerApplicationService.create(dto({ vehicle: { ...dto().vehicle, vin: '1HGCM82633A004353' }, seasonMonths: 4 }), {});
    expect(fulltime.seasonMonths).toBeUndefined();
  });

  it('accepts an application with no insurance details at all', async () => {
    const app = await assetPartnerApplicationService.create(dto({ insurance: undefined }), {});
    expect(app.status).toBe('submitted');
  });
});

describe('application schema', () => {
  const raw = (o: Record<string, unknown> = {}) => ({ ...dto(), signDate: new Date().toISOString(), ...o });

  it('needs the front, rear and odometer photos', () => {
    expect(createApplicationSchema.safeParse(raw()).success).toBe(true);
    expect(createApplicationSchema.safeParse(raw({ photos: PHOTOS.slice(0, 2) })).success).toBe(false);
    expect(createApplicationSchema.safeParse(raw({ photos: undefined })).success).toBe(false);
  });

  it('no longer takes part time', () => {
    expect(createApplicationSchema.safeParse(raw({ availability: 'parttime' })).success).toBe(false);
  });

  it('accepts a real six-digit signing code', () => {
    const base = { agreementVersion: 1, ndaVersion: 1, signedName: 'Jordan Ramirez', payout: { method: 'check', payableTo: 'Jordan', mailingAddress: '1 Main St, Dallas' }, acceptAgreement: true, acceptNda: true, acknowledgeDeductibles: true };
    expect(signAgreementSchema.safeParse({ ...base, emailCode: '482913' }).success).toBe(true);
    expect(signAgreementSchema.safeParse({ ...base, emailCode: 'dddddd' }).success).toBe(false);
  });
});

describe('application received email', () => {
  async function account() {
    return UserModel.create({ email: 'jordan@example.com', emailVerified: true, roles: ['guest'] });
  }

  it('lists the papers and insurance still to come', async () => {
    const user = await account();
    await assetPartnerApplicationService.createForAccount(String(user._id), { ...dto({ ownership: 'financed', lienholder: 'Chase', insurance: undefined }), email: undefined } as never, {});
    await flush();
    const sent = (notificationService.send as jest.Mock).mock.calls.map((c) => c[0]).find((n) => n.templateKey === 'account.asset_partner_application_received');
    expect(sent).toBeTruthy();
    expect(sent.body).toContain('loan statement');
    expect(sent.body).toContain('insurance declarations page');
  });

  it('says nothing is missing when both were uploaded with the application', async () => {
    const user = await account();
    await DocumentModel.create([
      { ownerId: String(user._id), category: 'title', url: 'https://files.example/title.pdf' },
      { ownerId: String(user._id), category: 'insurance', url: 'https://files.example/dec.pdf' },
    ]);
    await assetPartnerApplicationService.createForAccount(String(user._id), { ...dto({ insurance: { policyNumber: 'SF-1' } }), email: undefined } as never, {});
    await flush();
    const sent = (notificationService.send as jest.Mock).mock.calls.map((c) => c[0]).find((n) => n.templateKey === 'account.asset_partner_application_received');
    expect(sent.body).not.toContain('Still to upload');
  });
});

describe('ownership papers on the checklist', () => {
  it('asks for the paper that matches how the car is held', async () => {
    const created = await assetPartnerApplicationService.create(dto({ ownership: 'leased', lienholder: 'Toyota Financial' }), {});
    const ownershipOf = (assetPartnerService as unknown as { ownershipOf: (p: unknown) => Promise<string> }).ownershipOf.bind(assetPartnerService);
    expect(await ownershipOf({ applicationId: String(created._id) })).toBe('leased');
    expect(await ownershipOf({ email: 'nobody@example.com' })).toBe('owned');
    expect(OWNERSHIP_PAPERS.leased.label).toMatch(/Lease/);
  });
});

describe('partner emails', () => {
  it('are told apart from guest emails by template', () => {
    expect(isPartnerEmail('account.asset_partner_welcome')).toBe(true);
    expect(isPartnerEmail('asset_partner.statement_ready')).toBe(true);
    expect(isPartnerEmail('account.partner_added')).toBe(true);
    expect(isPartnerEmail('partner.contact_confirm')).toBe(true);
    expect(isPartnerEmail('account.welcome')).toBe(false);
    expect(isPartnerEmail(undefined)).toBe(false);
  });

  it('leave out the guest travel banner', () => {
    const partner = renderEmail({ title: 'Hi', body: 'Body', audience: 'partner' });
    expect(partner).not.toContain('cato-hero-banner');
    const guest = renderEmail({ title: 'Hi', body: 'Body', audience: 'guest' });
    expect(guest.includes('cato-hero-banner')).toBe(!!config.notifications.webUrl);
  });
});
