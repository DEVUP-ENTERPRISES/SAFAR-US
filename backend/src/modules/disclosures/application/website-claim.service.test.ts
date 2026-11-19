jest.mock('../../notifications/infrastructure/channel.providers', () => ({ channelProviders: { email: { send: jest.fn(async () => ({ ok: true })) } } }));

import { websiteClaimService } from './website-claim.service';
import { disclosureService } from './disclosure.service';
import { WebsiteClaimModel } from '../infrastructure/website-claim.model';
import { CLAIM_SEEDS, DISCLOSURE_SEED } from '../domain/defaults';
import { channelProviders } from '../../notifications/infrastructure/channel.providers';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  jest.clearAllMocks();
});

const email = channelProviders.email.send as jest.Mock;
const FIN = 'finance-1';
const ADMIN = 'admin-1';

describe('website claims register', () => {
  it('seeds every published claim once, live but waiting for evidence', async () => {
    expect(await websiteClaimService.seed()).toBe(CLAIM_SEEDS.length);
    expect(await websiteClaimService.seed()).toBe(0);
    const trips = await websiteClaimService.get('trips');
    expect(trips).toMatchObject({ status: 'evidence', live: { display: '5,100+' } });
    const map = await websiteClaimService.publicMap();
    expect(map.revenue2026).toMatchObject({ display: '$900,627', asOf: '2026-11-18' });
    expect(map).not.toHaveProperty('offeringTerms');
  });

  it('keeps the old figure live while an edit goes through evidence, verification and approval', async () => {
    await websiteClaimService.seed();
    await websiteClaimService.update(FIN, 'trips', { display: '5,400+', value: 5400, asOf: '2026-11-30' });
    expect((await websiteClaimService.publicMap()).trips?.display).toBe('5,100+');
    await expect(websiteClaimService.approve(ADMIN, 'trips')).rejects.toThrow('Only a verified claim');

    const fresh = await WebsiteClaimModel.findOneAndUpdate({ key: 'trips' }, { $set: { evidence: [] } }, { new: true });
    expect(fresh?.evidence).toHaveLength(0);
    await expect(websiteClaimService.verify(FIN, 'trips')).rejects.toThrow('supporting record');

    await websiteClaimService.addEvidence(FIN, 'trips', { label: 'Trip completion report Nov 2026', url: 'https://drive.example.com/report' });
    const verified = await websiteClaimService.verify(FIN, 'trips');
    expect(verified.status).toBe('verified');
    const approved = await websiteClaimService.approve(ADMIN, 'trips', 'Matches the booking export');
    expect(approved).toMatchObject({ status: 'approved', live: { display: '5,400+', asOf: '2026-11-30' }, approvedBy: ADMIN });
    expect(approved.nextReviewAt!.getTime() - approved.approvedAt!.getTime()).toBe(30 * 86_400_000);
    expect((await websiteClaimService.publicMap()).trips?.display).toBe('5,400+');
    expect(approved.history.map((h) => h.action)).toEqual(expect.arrayContaining(['Verified', 'Approved and published: 5,400+']));
  });

  it('needs a recorded legal review before a high-risk claim can be approved', async () => {
    await websiteClaimService.seed();
    await websiteClaimService.addEvidence(FIN, 'revenue2026', { label: 'General ledger Nov 2026' });
    expect((await websiteClaimService.verify(FIN, 'revenue2026')).status).toBe('legal_review');
    await expect(websiteClaimService.approve(ADMIN, 'revenue2026')).rejects.toThrow('legal review');
    await websiteClaimService.recordLegalReview(ADMIN, 'revenue2026', 'Reviewed by outside counsel on Nov 20');
    expect((await websiteClaimService.approve(ADMIN, 'revenue2026')).status).toBe('approved');
  });

  it('suspending takes the figure off the website and tells the team', async () => {
    await websiteClaimService.seed();
    await websiteClaimService.suspend(FIN, 'rating', 'Turo profile no longer shows 2,053 reviews');
    expect((await websiteClaimService.publicMap()).rating).toBeNull();
    expect(email).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('suspended') }));
    await expect(websiteClaimService.suspend(FIN, 'rating', 'again please')).rejects.toThrow('already suspended');

    await websiteClaimService.suspend(FIN, 'airportDelivery', 'Waiting for the DFW permit letter');
    expect(email.mock.calls[1][0].body).toContain('must also be removed from');
  });

  it('emails one digest of overdue reviews, then waits a week before reminding again', async () => {
    await websiteClaimService.seed();
    const now = new Date();
    expect(await websiteClaimService.remindOverdue(now)).toBe(CLAIM_SEEDS.length);
    expect(email).toHaveBeenCalledTimes(1);
    expect(await websiteClaimService.remindOverdue(new Date(now.getTime() + 86_400_000))).toBe(0);
    expect(await websiteClaimService.remindOverdue(new Date(now.getTime() + 8 * 86_400_000))).toBe(CLAIM_SEEDS.length);
  });
});

describe('website disclosures versions', () => {
  it('publishes version 1 from the package, then a new version per change, keeping history', async () => {
    await disclosureService.seed();
    await disclosureService.seed();
    expect((await disclosureService.current())?.version).toBe(1);

    const unchanged = await disclosureService.publish(ADMIN, { sections: DISCLOSURE_SEED, changeNote: 'no change' });
    expect(unchanged.version).toBe(1);

    const edited = DISCLOSURE_SEED.map((s) => (s.id === 'airport' ? { ...s, note: 'Airport delivery follows DFW and Love Field rules.' } : s));
    const v2 = await disclosureService.publish(ADMIN, { sections: edited, changeNote: 'Airport note updated after permit' });
    expect(v2.version).toBe(2);
    expect((await disclosureService.byVersion(1)).sections.find((s) => s.id === 'airport')?.note).toBe(DISCLOSURE_SEED.find((s) => s.id === 'airport')!.note);
    expect((await disclosureService.versions()).map((v) => v.version)).toEqual([2, 1]);
  });

  it('refuses a version that drops a section', async () => {
    await disclosureService.seed();
    await expect(disclosureService.publish(ADMIN, { sections: DISCLOSURE_SEED.slice(1), changeNote: 'remove general' })).rejects.toThrow('Every disclosure section');
  });
});
