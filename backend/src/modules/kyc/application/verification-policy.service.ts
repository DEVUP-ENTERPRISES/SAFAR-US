import {
  VerificationCheckModel,
  type VerificationCheckDoc,
  type VerificationType,
  type VerificationResult,
} from '../infrastructure/verification-check.model';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import type { VerificationPolicy } from '../../platform-config/infrastructure/platform-config.model';

const DAY_MS = 86_400_000;

export interface CanRunResult {
  /** May a new check be run right now? */
  allowed: boolean;
  /** Why not, when blocked: 'reuse' (a valid result already exists) or
   *  'frequency' (the per-period cap is reached). */
  reason?: 'reuse' | 'frequency';
  /** For 'frequency', the earliest time a new check may run. */
  nextAllowedAt?: Date;
  /** The still-valid check being reused, when reason is 'reuse'. */
  current?: VerificationCheckDoc;
}

export interface VerificationStatus {
  type: VerificationType;
  required: boolean;
  hasValid: boolean;
  validUntil?: Date;
  lastCheckedAt?: Date;
  checksInPeriod: number;
  policy: VerificationPolicy;
}

/**
 * The single place that decides, from admin config, whether a verification
 * check may run, is still valid, or must be re-done — so "MVR once every two
 * months, valid a year" is a config change, never a code change.
 *
 * The rule order matters and is deliberate:
 *   1. If a still-valid passing result exists → REUSE it (do not run, do not
 *      charge). This is what stops every booking triggering a fresh check.
 *   2. Otherwise, if the per-period cap is already used up → refuse until the
 *      window rolls forward.
 *   3. Otherwise → allowed.
 */
export class VerificationPolicyService {
  private async policyFor(type: VerificationType): Promise<VerificationPolicy> {
    const cfg = await platformConfigService.get();
    return cfg.verification[type];
  }

  /** The latest passing check that has not expired, if any. */
  async currentValid(userId: string, type: VerificationType, now = new Date()): Promise<VerificationCheckDoc | null> {
    return VerificationCheckModel.findOne({
      userId,
      type,
      result: 'passed',
      $or: [{ validUntil: { $gt: now } }, { validUntil: { $exists: false } }, { validUntil: null }],
    })
      .sort({ performedAt: -1 })
      .lean<VerificationCheckDoc>();
  }

  /** How many checks of this type were run within the configured window. */
  private async countInPeriod(userId: string, type: VerificationType, periodDays: number, now = new Date()): Promise<VerificationCheckDoc[]> {
    const since = new Date(now.getTime() - periodDays * DAY_MS);
    return VerificationCheckModel.find({ userId, type, performedAt: { $gte: since } })
      .sort({ performedAt: 1 })
      .lean<VerificationCheckDoc[]>();
  }

  /** Whether a NEW check may run now, honoring reuse-first then the frequency cap. */
  async canRun(userId: string, type: VerificationType, now = new Date()): Promise<CanRunResult> {
    const policy = await this.policyFor(type);

    const current = await this.currentValid(userId, type, now);
    if (current) return { allowed: false, reason: 'reuse', current };

    const inPeriod = await this.countInPeriod(userId, type, policy.periodDays, now);
    if (inPeriod.length >= policy.maxPerPeriod) {
      // The window frees up when the OLDEST check in it ages out.
      const oldest = inPeriod[0];
      const nextAllowedAt = new Date(new Date(oldest.performedAt).getTime() + policy.periodDays * DAY_MS);
      return { allowed: false, reason: 'frequency', nextAllowedAt };
    }
    return { allowed: true };
  }

  /**
   * Record a completed check. `validUntil` is derived from the config's
   * validityDays for a passing result, so tightening validity later does not
   * retroactively invalidate history — each row keeps the validity it was
   * written with.
   */
  async record(
    userId: string,
    type: VerificationType,
    input: { result: VerificationResult; provider?: string; reference?: string; riskScore?: number; notes?: string },
    now = new Date(),
  ): Promise<VerificationCheckDoc> {
    const policy = await this.policyFor(type);
    const validUntil =
      input.result === 'passed' ? new Date(now.getTime() + policy.validityDays * DAY_MS) : undefined;
    return VerificationCheckModel.create({
      userId,
      type,
      provider: input.provider,
      result: input.result,
      reference: input.reference,
      riskScore: input.riskScore,
      notes: input.notes,
      performedAt: now,
      validUntil,
    });
  }

  /** A guest's standing for one check type — for eligibility and admin views. */
  async statusFor(userId: string, type: VerificationType, now = new Date()): Promise<VerificationStatus> {
    const policy = await this.policyFor(type);
    const [current, inPeriod, latest] = await Promise.all([
      this.currentValid(userId, type, now),
      this.countInPeriod(userId, type, policy.periodDays, now),
      VerificationCheckModel.findOne({ userId, type }).sort({ performedAt: -1 }).lean<VerificationCheckDoc>(),
    ]);
    return {
      type,
      required: policy.required,
      hasValid: !!current,
      validUntil: current?.validUntil,
      lastCheckedAt: latest?.performedAt,
      checksInPeriod: inPeriod.length,
      policy,
    };
  }

  /** All check types at once, for an admin verification panel. */
  async fullStatus(userId: string, now = new Date()): Promise<VerificationStatus[]> {
    const types: VerificationType[] = ['identity', 'mvr', 'background', 'insurance'];
    return Promise.all(types.map((t) => this.statusFor(userId, t, now)));
  }

  /** Which required checks a guest is currently missing a valid result for. */
  async missingRequired(userId: string, now = new Date()): Promise<VerificationType[]> {
    const statuses = await this.fullStatus(userId, now);
    return statuses.filter((s) => s.required && !s.hasValid).map((s) => s.type);
  }
}

export const verificationPolicyService = new VerificationPolicyService();
