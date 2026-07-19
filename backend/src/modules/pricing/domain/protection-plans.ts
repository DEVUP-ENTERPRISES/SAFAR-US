import { platformConfigService } from '../../platform-config/application/platform-config.service';

/**
 * Protection tiers the guest chooses at checkout (Turo-style). Prices are NOT
 * hardcoded — they come from PlatformConfig, so they can be retuned live from
 * the admin panel. This module owns the shape and the fallback rule.
 */
export interface ProtectionPlan {
  code: string;
  label: string;
  description: string;
  /** Per day, in minor units (cents). Accrues to platform/insurer revenue. */
  pricePerDay: number;
}

/** All plans, live from config. */
export async function listProtectionPlans(): Promise<ProtectionPlan[]> {
  const cfg = await platformConfigService.get();
  return cfg.protection;
}

/** Resolve a plan by code, falling back to the cheapest tier. */
export async function getProtectionPlan(code?: string): Promise<ProtectionPlan> {
  const plans = await listProtectionPlans();
  const found = plans.find((p) => p.code === code);
  if (found) return found;
  // Fall back to the cheapest tier rather than assuming index 0 is the free one.
  return [...plans].sort((a, b) => a.pricePerDay - b.pricePerDay)[0];
}
