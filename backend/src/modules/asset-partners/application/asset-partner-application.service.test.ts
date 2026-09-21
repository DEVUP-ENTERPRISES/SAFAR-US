/**
 * Asset Partner application against a real in-memory MongoDB. Proves the core
 * business rule: approving an application verifies the applicant's host
 * account — which is what vehicle.service checks before letting anyone list a
 * car. Rejecting must never touch host verification.
 */
import { assetPartnerApplicationService } from './asset-partner-application.service';
import { assetPartnerService } from './asset-partner.service';
import { AssetPartnerApplicationModel } from '../infrastructure/asset-partner-application.model';
import { AssetPartnerModel } from '../infrastructure/asset-partner.model';
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

  /*
   * This used to assert the opposite — that approving someone with no account
   * left hostVerified false and created nothing, on the reasoning that we must
   * not "fake" verification for an account that doesn't exist.
   *
   * That left an approved applicant in a dead end: no partner record, no host,
   * and nothing anywhere that would notice when they eventually registered.
   * Approval is the decision; the account is the mechanism that carries it out,
   * not a second gate. Enrolment now creates the missing layers — see
   * assetPartnerService.enrolByEmail — with NO password set, so nothing is
   * granted that the applicant cannot already prove by receiving a code at the
   * address they applied with.
   */
  it('approval creates the account for an applicant who has not registered', async () => {
    const app = await assetPartnerApplicationService.create(baseDto({ email: 'nobody@example.com' }), {});
    const reviewed = await assetPartnerApplicationService.review(app._id, ADMIN, 'approved');
    expect(reviewed.status).toBe('approved');
    expect(reviewed.hostVerified).toBe(true);

    const user = await UserModel.findOne({ email: 'nobody@example.com' }).lean();
    expect(user).toBeTruthy();
    // Created for them, not by them: no credential is set on their behalf.
    expect(user!.passwordHash).toBeUndefined();

    const partner = await AssetPartnerModel.findOne({ userId: user!._id }).lean();
    expect(partner).toBeTruthy();
    expect(partner!.status).toBe('onboarding');
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
      expect(dash.partner).toBeUndefined();
    });

    // "Not started" is not "$0 earned" — reporting zeroed money to someone who
    // is not in the programme yet would read as "my car earned nothing".
    it('reports no money at all until they are in the programme', async () => {
      await assetPartnerApplicationService.create(baseDto(), {});
      const user = await UserModel.create({ email: 'jordan@example.com', roles: ['guest'] });

      const dash = await assetPartnerApplicationService.dashboardFor(user._id);
      expect(dash.partner).toBeUndefined();
      expect(dash.currentStatement).toBeUndefined();
      expect(dash.vehicles).toEqual([]);
    });

    it('enrols a partner on approval and starts them in onboarding, not active', async () => {
      const user = await UserModel.create({ email: 'jordan@example.com', roles: ['guest'] });
      const app = await assetPartnerApplicationService.create(baseDto(), {});
      await assetPartnerApplicationService.review(app._id, ADMIN, 'approved');

      const dash = await assetPartnerApplicationService.dashboardFor(user._id);
      expect(dash.partner).toBeDefined();
      // Approved on paper is not live: the car still has to be inspected.
      expect(dash.partner!.status).toBe('onboarding');
      expect(dash.partner!.partnerType).toBe('individual');
      expect(dash.currentStatement).toBeDefined();
    });

    it('carries the fleet partner type through to the programme', async () => {
      const user = await UserModel.create({ email: 'jordan@example.com', roles: ['guest'] });
      const app = await assetPartnerApplicationService.create(baseDto({ partnerType: 'fleet' }), {});
      await assetPartnerApplicationService.review(app._id, ADMIN, 'approved');

      const dash = await assetPartnerApplicationService.dashboardFor(user._id);
      expect(dash.partner!.partnerType).toBe('fleet');
    });
  });

  afterEach(async () => {
    await AssetPartnerApplicationModel.deleteMany({});
    await UserModel.deleteMany({});
    await HostModel.deleteMany({});
  });
});

/**
 * Adding a partner directly — the ~20 owners who signed before the website
 * existed and so have no application to approve.
 */
describe('asset partner direct add', () => {
  const input = {
    email: 'Owner@Example.com',
    fullName: 'Casey Nolan',
    phone: '2145550199',
    partnerType: 'individual' as const,
  };

  it('creates the account, host and membership from just a name and email', async () => {
    const { partner, accountCreated, alreadyExisted } = await assetPartnerService.addDirect(input, {
      notify: false,
    });

    expect(alreadyExisted).toBe(false);
    expect(accountCreated).toBe(true);
    expect(partner.status).toBe('onboarding');
    expect(partner.displayName).toBe('Casey Nolan');
    // Standard platform terms until something is actually negotiated — a
    // fresh subdocument with nothing set serializes as undefined, not {}.
    expect(partner.terms).toBeFalsy();

    // Email is normalised, so a later sign-in at owner@example.com matches.
    const user = await UserModel.findOne({ email: 'owner@example.com' }).lean();
    expect(user).toBeTruthy();
    expect(user!.firstName).toBe('Casey');
    expect(user!.lastName).toBe('Nolan');
    // No credential is ever set on someone else's behalf.
    expect(user!.passwordHash).toBeUndefined();

    // The host layer a Vehicle hangs off must exist AND be verified, or the
    // partner's car cannot be listed.
    const host = await HostModel.findOne({ userId: user!._id }).lean();
    expect(host!.verificationStatus).toBe('verified');
    expect(partner.hostId).toBe(host!._id);
  });

  it('is idempotent — re-entering the same owner reports it, not a duplicate', async () => {
    const first = await assetPartnerService.addDirect(input, { notify: false });
    const second = await assetPartnerService.addDirect(input, { notify: false });

    expect(second.alreadyExisted).toBe(true);
    expect(second.partner._id).toBe(first.partner._id);
    expect(await AssetPartnerModel.countDocuments({})).toBe(1);
    expect(await UserModel.countDocuments({})).toBe(1);
  });

  it('links to an existing account rather than creating a second one', async () => {
    const existing = await UserModel.create({ email: 'owner@example.com', roles: ['guest'] });

    const { partner, accountCreated } = await assetPartnerService.addDirect(input, { notify: false });

    expect(accountCreated).toBe(false);
    expect(partner.userId).toBe(existing._id);
    expect(await UserModel.countDocuments({})).toBe(1);
  });

  it('uses the business name as the display name for a business partner', async () => {
    const { partner } = await assetPartnerService.addDirect(
      { ...input, partnerType: 'business', businessName: 'Nolan Mobility LLC' },
      { notify: false },
    );
    expect(partner.displayName).toBe('Nolan Mobility LLC');
    expect(partner.businessName).toBe('Nolan Mobility LLC');
  });
});
