/**
 * Asset Partner application against a real in-memory MongoDB. Proves the core
 * business rule: approving an application verifies the applicant's host
 * account — which is what vehicle.service checks before letting anyone list a
 * car. Rejecting must never touch host verification.
 */
import { assetPartnerApplicationService } from './asset-partner-application.service';
import { AssetPartnerApplicationModel } from '../infrastructure/asset-partner-application.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';
import type { CreateApplicationDto } from '../dto/asset-partner-application.schemas';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

const ADMIN = 'admin-1';

function baseDto(overrides: Partial<CreateApplicationDto> = {}): CreateApplicationDto {
  return {
    fullName: 'Jordan Ramirez',
    partnerType: 'individual',
    email: 'jordan@example.com',
    phone: '2145550142',
    address: '1 Main St',
    city: 'Dallas',
    state: 'TX',
    zip: '75201',
    vehicle: {
      year: '2024',
      make: 'BMW',
      model: '5 Series',
      mileage: 18400,
      vin: '1HGCM82633A004352',
      plate: 'ABC-1234',
    },
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
    ...overrides,
  } as CreateApplicationDto;
}

describe('asset partner application', () => {
  it('creates a submission with a server-generated reference, not client input', async () => {
    const app = await assetPartnerApplicationService.create(baseDto(), {});
    expect(app.reference).toMatch(/^CD-AP-\d{6}$/);
    expect(app.status).toBe('submitted');
  });

  it('approval verifies the applicant as a host when their account exists', async () => {
    const user = await UserModel.create({ email: 'jordan@example.com', roles: ['guest'] });
    const app = await assetPartnerApplicationService.create(baseDto(), {});

    const reviewed = await assetPartnerApplicationService.review(app._id, ADMIN, 'approved');
    expect(reviewed.status).toBe('approved');
    expect(reviewed.hostVerified).toBe(true);

    const host = await HostModel.findOne({ userId: user._id }).lean();
    expect(host).toBeTruthy();
    expect(host!.verificationStatus).toBe('verified');
  });

  it('approval without a matching account records the decision but does not fake verification', async () => {
    const app = await assetPartnerApplicationService.create(baseDto({ email: 'nobody@example.com' }), {});
    const reviewed = await assetPartnerApplicationService.review(app._id, ADMIN, 'approved');
    expect(reviewed.status).toBe('approved');
    expect(reviewed.hostVerified).toBe(false);
  });

  it('rejection never verifies a host', async () => {
    await UserModel.create({ email: 'jordan@example.com', roles: ['guest'] });
    const app = await assetPartnerApplicationService.create(baseDto(), {});
    const reviewed = await assetPartnerApplicationService.review(app._id, ADMIN, 'rejected');
    expect(reviewed.status).toBe('rejected');
    expect(reviewed.hostVerified).toBe(false);
    expect(await HostModel.countDocuments({})).toBe(0);
  });

  it('refuses to re-review an already-decided application', async () => {
    const app = await assetPartnerApplicationService.create(baseDto(), {});
    await assetPartnerApplicationService.review(app._id, ADMIN, 'approved');
    await expect(assetPartnerApplicationService.review(app._id, ADMIN, 'rejected')).rejects.toThrow();
  });

  describe('partner dashboard', () => {
    /*
     * The intake form is public and never asks for a password, so the common
     * path is: apply while signed out, register afterwards. Matching only on
     * submittedByUserId would leave that person permanently unable to see the
     * application they just filed.
     */
    it('finds an application submitted before the applicant had an account', async () => {
      await assetPartnerApplicationService.create(baseDto(), {}); // signed out
      const user = await UserModel.create({ email: 'jordan@example.com', roles: ['guest'] });

      const dash = await assetPartnerApplicationService.dashboardFor(user._id);
      expect(dash.applications).toHaveLength(1);
      expect(dash.applications[0].email).toBe('jordan@example.com');
    });

    it('finds an application submitted while signed in, whatever email was typed', async () => {
      const user = await UserModel.create({ email: 'work@example.com', roles: ['guest'] });
      await assetPartnerApplicationService.create(baseDto({ email: 'personal@example.com' }), {
        userId: user._id,
      });

      const dash = await assetPartnerApplicationService.dashboardFor(user._id);
      expect(dash.applications).toHaveLength(1);
    });

    it('never returns someone else’s application', async () => {
      await assetPartnerApplicationService.create(baseDto(), {});
      const other = await UserModel.create({ email: 'someone.else@example.com', roles: ['guest'] });

      const dash = await assetPartnerApplicationService.dashboardFor(other._id);
      expect(dash.applications).toHaveLength(0);
      expect(dash.partner.approved).toBe(false);
    });

    // "Not started" is not "$0 earned" — reporting zeroed money to an applicant
    // who has no host account yet would read as "my car earned nothing".
    it('reports no earnings at all until a host account exists', async () => {
      await assetPartnerApplicationService.create(baseDto(), {});
      const user = await UserModel.create({ email: 'jordan@example.com', roles: ['guest'] });

      const dash = await assetPartnerApplicationService.dashboardFor(user._id);
      expect(dash.earnings).toBeUndefined();
      expect(dash.vehicles).toEqual([]);
    });

    it('reflects approval once the application is approved', async () => {
      const user = await UserModel.create({ email: 'jordan@example.com', roles: ['guest'] });
      const app = await assetPartnerApplicationService.create(baseDto(), {});
      await assetPartnerApplicationService.review(app._id, ADMIN, 'approved');

      const dash = await assetPartnerApplicationService.dashboardFor(user._id);
      expect(dash.partner.approved).toBe(true);
      expect(dash.partner.hostVerified).toBe(true);
      expect(dash.earnings).toBeDefined();
    });
  });

  afterEach(async () => {
    await AssetPartnerApplicationModel.deleteMany({});
    await UserModel.deleteMany({});
    await HostModel.deleteMany({});
  });
});
