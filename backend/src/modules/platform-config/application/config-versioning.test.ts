/**
 * Platform-config versioning against a real in-memory MongoDB. Proves the
 * backbone the pricing spec requires: every publish is versioned and snapshotted
 * to an append-only ledger, an old version can be rolled back to (as a new
 * version, never a rewrite), and a future-dated change is staged and promoted.
 */
import { platformConfigService } from './platform-config.service';
import { ConfigVersionModel } from '../infrastructure/config-version.model';
import { PlatformConfigModel } from '../infrastructure/platform-config.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

const ADMIN = 'admin-1';

describe('platform-config versioning', () => {
  it('bumps configVersion and writes a snapshot on every publish', async () => {
    const before = (await platformConfigService.get()).configVersion ?? 0;

    await platformConfigService.update({ commission: { defaultBps: 2500 } }, ADMIN, 'raise take rate');
    const afterOne = await platformConfigService.get();
    expect(afterOne.configVersion).toBe(before + 1);
    expect(afterOne.commission.defaultBps).toBe(2500);

    await platformConfigService.update({ tax: { bps: 500 } }, ADMIN);
    const afterTwo = await platformConfigService.get();
    expect(afterTwo.configVersion).toBe(before + 2);

    const versions = await platformConfigService.listVersions();
    expect(versions.length).toBeGreaterThanOrEqual(2);
    // Newest first, and the snapshot captured the full live economics.
    expect(versions[0].version).toBe(afterTwo.configVersion);
    expect((versions[0].snapshot as { commission: { defaultBps: number } }).commission.defaultBps).toBe(2500);
    expect(versions.find((v) => v.reason === 'raise take rate')).toBeTruthy();
  });

  it('rolls back to an earlier version by re-publishing it as a new version', async () => {
    await platformConfigService.update({ commission: { defaultBps: 2000 } }, ADMIN); // v1
    const v1 = (await platformConfigService.get()).configVersion!;
    await platformConfigService.update({ commission: { defaultBps: 3000 } }, ADMIN); // v2
    expect((await platformConfigService.get()).commission.defaultBps).toBe(3000);

    const restored = await platformConfigService.rollback(v1, ADMIN, 'revert the hike');
    // Value is back to v1's, but as a brand-new version — history is not rewritten.
    expect(restored.commission.defaultBps).toBe(2000);
    expect(restored.configVersion).toBeGreaterThan(v1 + 1);
    const newest = (await platformConfigService.listVersions())[0];
    expect(newest.restoredFromVersion).toBe(v1);
  });

  it('refuses a guard-rail-violating publish and does not create a version', async () => {
    const before = (await platformConfigService.get()).configVersion ?? 0;
    await expect(
      platformConfigService.update({ commission: { defaultBps: 9000, maxBps: 4000 } }, ADMIN),
    ).rejects.toThrow();
    expect((await platformConfigService.get()).configVersion ?? 0).toBe(before);
  });

  it('stages a future change and promotes only the due ones', async () => {
    const past = new Date(Date.now() - 60_000);
    // scheduleUpdate refuses a past date, so stage via the model directly to
    // simulate a change that has since come due.
    await ConfigVersionModel.create({
      version: -1, status: 'scheduled', snapshot: { tax: { bps: 250 } }, isPatch: true,
      actorId: ADMIN, changedKeys: ['tax'], effectiveFrom: past,
    });
    // And one still in the future — must NOT be applied yet.
    await platformConfigService.scheduleUpdate({ tax: { bps: 999 } }, new Date(Date.now() + 3_600_000), ADMIN);

    const applied = await platformConfigService.applyDueScheduled();
    expect(applied).toBe(1);
    expect((await platformConfigService.get()).tax.bps).toBe(250);
    expect((await platformConfigService.listScheduled()).length).toBe(1); // the future one remains
  });

  it('scheduleUpdate rejects a non-future effective date', async () => {
    await expect(
      platformConfigService.scheduleUpdate({ tax: { bps: 100 } }, new Date(Date.now() - 1000), ADMIN),
    ).rejects.toThrow();
  });

  afterEach(async () => {
    await PlatformConfigModel.deleteMany({});
    await ConfigVersionModel.deleteMany({});
  });
});
