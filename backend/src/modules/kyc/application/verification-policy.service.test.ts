/**
 * Verification-frequency policy against in-memory Mongo. Proves the behaviour
 * the business asked for — "MVR at most once every two months, reuse a valid
 * result" — is driven entirely by admin config, not code.
 */
import { verificationPolicyService } from './verification-policy.service';
import { VerificationCheckModel } from '../infrastructure/verification-check.model';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { PlatformConfigModel } from '../../platform-config/infrastructure/platform-config.model';
import { ConfigVersionModel } from '../../platform-config/infrastructure/config-version.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

const USER = 'guest-1';
const DAY = 86_400_000;

describe('verification frequency policy (MVR)', () => {
  it('reuses a still-valid result instead of running a new check', async () => {
    await verificationPolicyService.record(USER, 'mvr', { result: 'passed', provider: 'checkr' });
    const decision = await verificationPolicyService.canRun(USER, 'mvr');
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('reuse');
    expect(decision.current).toBeTruthy();
  });

  it('enforces the configured max-per-period after validity has lapsed', async () => {
    const now = new Date();
    // A failed check 10 days ago (not valid, so no reuse) — but it still counts
    // toward the once-per-60-days frequency cap (default maxPerPeriod 1).
    await VerificationCheckModel.create({
      userId: USER, type: 'mvr', result: 'failed', performedAt: new Date(now.getTime() - 10 * DAY),
    });
    const decision = await verificationPolicyService.canRun(USER, 'mvr', now);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('frequency');
    // Frees up 60 days after that check.
    expect(decision.nextAllowedAt!.getTime()).toBeGreaterThan(now.getTime());
  });

  it('allows a new check once the window has rolled past', async () => {
    const now = new Date();
    await VerificationCheckModel.create({
      userId: USER, type: 'mvr', result: 'failed', performedAt: new Date(now.getTime() - 61 * DAY),
    });
    const decision = await verificationPolicyService.canRun(USER, 'mvr', now);
    expect(decision.allowed).toBe(true);
  });

  it('honors an admin config change without any code change', async () => {
    const now = new Date();
    // One check 40 days ago. Under the default (1 per 60 days) that blocks a new
    // one; loosen the policy to 2 per 60 days and it is allowed — same data,
    // different config.
    await VerificationCheckModel.create({
      userId: USER, type: 'mvr', result: 'failed', performedAt: new Date(now.getTime() - 40 * DAY),
    });
    expect((await verificationPolicyService.canRun(USER, 'mvr', now)).reason).toBe('frequency');

    await platformConfigService.update({ verification: { mvr: { maxPerPeriod: 2 } } }, 'admin-1');
    expect((await verificationPolicyService.canRun(USER, 'mvr', now)).allowed).toBe(true);
  });

  it('derives validUntil from the configured validityDays on a pass', async () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const check = await verificationPolicyService.record(USER, 'mvr', { result: 'passed' }, now);
    // Default validityDays = 365.
    expect(check.validUntil!.getTime()).toBe(now.getTime() + 365 * DAY);
  });

  afterEach(async () => {
    await PlatformConfigModel.deleteMany({});
    await ConfigVersionModel.deleteMany({});
    await VerificationCheckModel.deleteMany({});
  });
});
