/**
 * Core Asset Partner lifecycle: enrolment, status transitions, terms
 * resolution, and self-service payout details. The approval flow that
 * CREATES a partner is covered in asset-partner-application.service.test.ts;
 * this pins the service in isolation.
 */
import { assetPartnerService } from './asset-partner.service';
import { AssetPartnerModel } from '../infrastructure/asset-partner.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

describe('asset partner service', () => {
  it('enrols a new partner starting in onboarding, not active', async () => {
    const partner = await assetPartnerService.enrol({
      userId: 'user-1',
      hostId: 'host-1',
      partnerType: 'individual',
      displayName: 'Jordan Ramirez',
    });
    expect(partner.status).toBe('onboarding');
    expect(partner.approvedAt).toBeInstanceOf(Date);
  });

  // Re-approving an already-enrolled applicant must not create a second
  // membership row — the unique index on userId exists for exactly this.
  it('is idempotent — enrolling the same user twice returns the same record', async () => {
    const first = await assetPartnerService.enrol({
      userId: 'user-1',
      hostId: 'host-1',
      partnerType: 'individual',
      displayName: 'Jordan Ramirez',
    });
    const second = await assetPartnerService.enrol({
      userId: 'user-1',
      hostId: 'host-1',
      partnerType: 'individual',
      displayName: 'Jordan Ramirez',
    });
    expect(second._id).toBe(first._id);
    expect(await AssetPartnerModel.countDocuments({})).toBe(1);
  });

  describe('status transitions', () => {
    it('allows onboarding → active', async () => {
      const p = await assetPartnerService.enrol({ userId: 'u1', hostId: 'h1', partnerType: 'individual', displayName: 'A' });
      const active = await assetPartnerService.transition(p._id, 'active');
      expect(active.status).toBe('active');
      expect(active.activatedAt).toBeInstanceOf(Date);
    });

    it('allows active → suspended, recording the reason', async () => {
      const p = await assetPartnerService.enrol({ userId: 'u1', hostId: 'h1', partnerType: 'individual', displayName: 'A' });
      await assetPartnerService.transition(p._id, 'active');
      const suspended = await assetPartnerService.transition(p._id, 'suspended', { reason: 'Insurance lapsed' });
      expect(suspended.status).toBe('suspended');
      expect(suspended.suspendedReason).toBe('Insurance lapsed');
    });

    it('allows a suspended partner to be reinstated', async () => {
      const p = await assetPartnerService.enrol({ userId: 'u1', hostId: 'h1', partnerType: 'individual', displayName: 'A' });
      await assetPartnerService.transition(p._id, 'active');
      await assetPartnerService.transition(p._id, 'suspended');
      const reinstated = await assetPartnerService.transition(p._id, 'active');
      expect(reinstated.status).toBe('active');
    });

    // exited is a dead end — nothing can move a partner out of it.
    it('refuses to leave the exited state', async () => {
      const p = await assetPartnerService.enrol({ userId: 'u1', hostId: 'h1', partnerType: 'individual', displayName: 'A' });
      await assetPartnerService.transition(p._id, 'exited');
      await expect(assetPartnerService.transition(p._id, 'active')).rejects.toThrow();
    });

    it('refuses onboarding → suspended directly (not a real transition)', async () => {
      const p = await assetPartnerService.enrol({ userId: 'u1', hostId: 'h1', partnerType: 'individual', displayName: 'A' });
      await expect(assetPartnerService.transition(p._id, 'suspended')).rejects.toThrow();
    });

    it('is a no-op when already in the requested state', async () => {
      const p = await assetPartnerService.enrol({ userId: 'u1', hostId: 'h1', partnerType: 'individual', displayName: 'A' });
      const same = await assetPartnerService.transition(p._id, 'onboarding');
      expect(same._id).toBe(p._id);
    });
  });

  describe('terms resolution', () => {
    it('falls back to the platform default when nothing is negotiated', async () => {
      const p = await assetPartnerService.enrol({ userId: 'u1', hostId: 'h1', partnerType: 'individual', displayName: 'A' });
      const terms = await assetPartnerService.termsFor(p);
      expect(terms.managementFeeBps).toBe(2000);
      expect(terms.negotiated).toBe(false);
    });

    it('overrides only the fields that were actually negotiated', async () => {
      const p = await assetPartnerService.enrol({ userId: 'u1', hostId: 'h1', partnerType: 'fleet', displayName: 'A' });
      const updated = await assetPartnerService.setTerms(p._id, { managementFeeBps: 1500 });
      const terms = await assetPartnerService.termsFor(updated);
      expect(terms.managementFeeBps).toBe(1500);
      // Untouched fields still come from the platform default.
      expect(terms.insuranceMonthlyCents).toBe(13_700);
      expect(terms.negotiated).toBe(true);
    });
  });

  describe('payout details', () => {
    it('lets a partner set their own mailing address', async () => {
      await assetPartnerService.enrol({ userId: 'u1', hostId: 'h1', partnerType: 'individual', displayName: 'A' });
      const updated = await assetPartnerService.setPayoutDetails('u1', {
        mailingAddress: '1 Main St, Dallas, TX 75201',
      });
      expect(updated.payoutDetails?.mailingAddress).toBe('1 Main St, Dallas, TX 75201');
    });

    it('refuses to set payout details for someone who is not a partner', async () => {
      await expect(
        assetPartnerService.setPayoutDetails('nobody', { mailingAddress: '1 Main St' }),
      ).rejects.toThrow();
    });

    // setPayoutDetails must never be able to touch `terms` — that is a
    // negotiated commercial agreement, not the partner's own information.
    it('never lets payout details bleed into terms', async () => {
      const p = await assetPartnerService.enrol({ userId: 'u1', hostId: 'h1', partnerType: 'individual', displayName: 'A' });
      await assetPartnerService.setPayoutDetails('u1', { mailingAddress: '1 Main St' });
      const reloaded = await assetPartnerService.getById(p._id);
      // Mongoose stores nothing for an all-empty subdocument, so `terms` comes
      // back undefined rather than {} — which is exactly why termsFor() guards
      // with `partner.terms ?? {}` before reading it.
      expect(reloaded.terms?.managementFeeBps).toBeUndefined();
      // And the resolved view still answers with the platform default.
      const terms = await assetPartnerService.termsFor(reloaded);
      expect(terms.managementFeeBps).toBe(2000);
      expect(terms.negotiated).toBe(false);
    });
  });
});
