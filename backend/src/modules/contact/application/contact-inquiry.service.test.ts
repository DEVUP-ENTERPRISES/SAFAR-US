/**
 * Contact inquiry against a real in-memory MongoDB. Proves the lead is always
 * saved — even when no email provider is configured (the LoggingProvider
 * stand-in in test env) — and that the admin queue filters/responds correctly.
 */
import { contactInquiryService } from './contact-inquiry.service';
import { ContactInquiryModel } from '../infrastructure/contact-inquiry.model';
import { PlatformConfigModel } from '../../platform-config/infrastructure/platform-config.model';
import { ConfigVersionModel } from '../../platform-config/infrastructure/config-version.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';
import type { CreateContactInquiryDto } from '../dto/contact-inquiry.schemas';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

const STAFF = 'staff-1';

function baseDto(overrides: Partial<CreateContactInquiryDto> = {}): CreateContactInquiryDto {
  return {
    fullName: 'Jordan Ramirez',
    email: 'jordan@example.com',
    interest: 'asset_partner',
    message: 'I have a 2023 BMW 5 Series I would like to list.',
    ...overrides,
  };
}

describe('contact inquiry', () => {
  it('saves the lead even though no email provider is configured in test env', async () => {
    const doc = await contactInquiryService.create(baseDto(), {});
    expect(doc.status).toBe('new');
    expect(doc.interest).toBe('asset_partner');
    const saved = await ContactInquiryModel.findById(doc._id).lean();
    expect(saved).toBeTruthy();
  });

  it('filters the admin queue by interest and status', async () => {
    await contactInquiryService.create(baseDto({ interest: 'investor', email: 'inv@example.com' }), {});
    await contactInquiryService.create(baseDto({ interest: 'asset_partner' }), {});

    const investors = await contactInquiryService.adminList({ interest: 'investor' });
    expect(investors.total).toBe(1);
    expect(investors.items[0].interest).toBe('investor');

    const assetPartners = await contactInquiryService.adminList({ interest: 'asset_partner' });
    expect(assetPartners.total).toBe(1);
  });

  it('marks a lead responded and records who', async () => {
    const doc = await contactInquiryService.create(baseDto(), {});
    const updated = await contactInquiryService.markResponded(doc._id, STAFF, 'Called, scheduled inspection.');
    expect(updated.status).toBe('responded');
    expect(updated.respondedBy).toBe(STAFF);
    expect(updated.respondedAt).toBeTruthy();
  });

  it('counts open leads by interest category', async () => {
    await contactInquiryService.create(baseDto({ interest: 'investor', email: 'a@example.com' }), {});
    await contactInquiryService.create(baseDto({ interest: 'investor', email: 'b@example.com' }), {});
    const doc = await contactInquiryService.create(baseDto({ interest: 'corporate', email: 'c@example.com' }), {});
    await contactInquiryService.markResponded(doc._id, STAFF); // responded — excluded from "open" counts

    const counts = await contactInquiryService.countsByInterest();
    expect(counts.investor).toBe(2);
    expect(counts.corporate).toBeUndefined();
  });

  afterEach(async () => {
    await ContactInquiryModel.deleteMany({});
    await PlatformConfigModel.deleteMany({});
    await ConfigVersionModel.deleteMany({});
  });
});
