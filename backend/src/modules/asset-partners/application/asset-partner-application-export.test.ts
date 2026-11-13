jest.mock('../../maps/infrastructure/maps.provider', () => ({ mapsProvider: { geocode: jest.fn() } }));

import { applicationsCsv, locateApplication, milesBetween, submittedFromMiles } from './asset-partner-application-export';
import { AssetPartnerApplicationModel, type AssetPartnerApplicationDoc } from '../infrastructure/asset-partner-application.model';
import { mapsProvider } from '../../maps/infrastructure/maps.provider';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => { await clearTestDb(); jest.clearAllMocks(); });

const geocode = mapsProvider.geocode as jest.Mock;

const app = (over: Partial<AssetPartnerApplicationDoc> = {}) => ({
  _id: 'app-1', reference: 'AP-1001', status: 'submitted', kind: 'partner', createdAt: new Date('2026-11-14T10:00:00Z'),
  fullName: 'Jordan Ramirez', partnerType: 'individual', email: 'jordan@example.com', phone: '2145550142',
  address: '1 Main St', city: 'Dallas', state: 'TX', zip: '75201',
  vehicle: { year: '2024', make: 'BMW', model: '5 Series', mileage: 18400, vin: '1HGCM82633A004352', plate: 'ABC 1234' },
  ownership: 'owned', hadAccident: false, photos: [{ url: 'https://files.example/f.jpg' }], availability: 'fulltime',
  ...over,
}) as unknown as AssetPartnerApplicationDoc;

describe('application spreadsheet', () => {
  it('has a header row, one row per application, and opens as UTF-8 in Excel', () => {
    const csv = applicationsCsv([app(), app({ _id: 'app-2', reference: 'AP-1002' } as never)]);
    expect(csv.startsWith('\uFEFFReference,Status,')).toBe(true);
    expect(csv.trim().split('\r\n')).toHaveLength(3);
    expect(csv).toContain('ABC1234');
    expect(csv).toContain('"1 Main St, Dallas, TX 75201"');
  });

  it('quotes commas and quotes, and stops a typed formula from running', () => {
    const csv = applicationsCsv([app({ notes: '=HYPERLINK("http://evil")', fullName: 'Ramirez, "JR"' } as never)]);
    expect(csv).toContain('"Ramirez, ""JR"""');
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });
});

describe('address check', () => {
  it('stores the map result once and does not look it up again', async () => {
    await AssetPartnerApplicationModel.collection.insertOne({ ...app(), _id: 'app-1' } as never);
    geocode.mockResolvedValueOnce([{ lat: 32.78, lng: -96.8, formatted: '1 Main St, Dallas, TX 75201, USA', city: 'Dallas' }]);
    const geo = await locateApplication(app());
    expect(geo).toMatchObject({ matched: true, lat: 32.78, lng: -96.8 });
    const saved = await AssetPartnerApplicationModel.findById('app-1').lean<AssetPartnerApplicationDoc>();
    expect(saved?.geo?.matched).toBe(true);
    await locateApplication(saved!);
    expect(geocode).toHaveBeenCalledTimes(1);
  });

  it('marks an address the map cannot find, and survives a provider outage', async () => {
    geocode.mockResolvedValueOnce([]);
    expect(await locateApplication(app())).toMatchObject({ matched: false });
    geocode.mockRejectedValueOnce(new Error('timeout'));
    await expect(locateApplication(app({ _id: 'app-9' } as never))).resolves.toBeUndefined();
  });

  it('measures how far the applicant was from the address', () => {
    expect(Math.round(milesBetween({ lat: 32.7767, lng: -96.797 }, { lat: 29.7604, lng: -95.3698 }))).toBe(225);
    expect(submittedFromMiles({ geo: { lat: 32.78, lng: -96.8, matched: true, checkedAt: new Date() }, submittedFrom: { lat: 32.78, lng: -96.8, at: new Date() } })).toBe(0);
    expect(submittedFromMiles({ geo: { matched: false, checkedAt: new Date() }, submittedFrom: { lat: 1, lng: 1, at: new Date() } })).toBeUndefined();
  });
});
