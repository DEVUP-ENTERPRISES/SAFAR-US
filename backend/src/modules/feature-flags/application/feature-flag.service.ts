import { createHash } from 'crypto';
import { FeatureFlagModel, type FeatureFlagDoc } from '../infrastructure/feature-flag.model';

/** Stable 0–99 bucket for a (user, flag) pair → deterministic % rollout. */
function bucket(userId: string, key: string): number {
  const h = createHash('sha256').update(`${key}:${userId}`).digest('hex').slice(0, 8);
  return parseInt(h, 16) % 100;
}

export class FeatureFlagService {
  async list(): Promise<FeatureFlagDoc[]> {
    return FeatureFlagModel.find().sort({ _id: 1 }).lean<FeatureFlagDoc[]>();
  }

  async upsert(
    key: string,
    patch: Partial<Omit<FeatureFlagDoc, '_id'>>,
    updatedBy: string,
  ): Promise<FeatureFlagDoc> {
    const doc = await FeatureFlagModel.findByIdAndUpdate(
      key,
      { $set: { ...patch, updatedBy }, $setOnInsert: { _id: key } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean<FeatureFlagDoc>();
    return doc!;
  }

  /** Evaluate all flags for a principal → { key: boolean } for the client. */
  async evaluateForUser(userId: string, roles: string[]): Promise<Record<string, boolean>> {
    const flags = await this.list();
    const out: Record<string, boolean> = {};
    for (const f of flags) out[f._id] = this.evaluate(f, userId, roles);
    return out;
  }

  private evaluate(flag: FeatureFlagDoc, userId: string, roles: string[]): boolean {
    if (!flag.enabled) return false;
    if (flag.rollout.allowUserIds.includes(userId)) return true;
    if (flag.rollout.allowRoles.some((r) => roles.includes(r))) return true;
    if (flag.rollout.percentage >= 100) return true;
    if (flag.rollout.percentage <= 0) return false;
    return bucket(userId, flag._id) < flag.rollout.percentage;
  }
}

export const featureFlagService = new FeatureFlagService();
