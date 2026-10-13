import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { insurancePlanService, type InsurerCheckoutPlan, type PlanVehicle } from '../../insurance-partners/application/insurance-plan.service';

/**
 * Protection tiers the guest chooses at checkout (Turo-style). CatoDrive's own
 * tiers come from PlatformConfig; insurance partners add their own plans for
 * the cars they are licensed to cover. Nothing here is hardcoded.
 */
export interface ProtectionPlan {
  code: string;
  label: string;
  description: string;
  /** Per day, in minor units (cents). */
  pricePerDay: number;
  /** Set when an insurance partner sells the plan; its premium is owed to that insurer. */
  insurer?: InsurerCheckoutPlan['insurer'];
  deductibleCents?: number;
  liabilityLimitCents?: number;
  coverage?: string[];
}

/** A resolved plan with the commission CatoDrive keeps on an insurer's premium. */
export type ResolvedProtectionPlan = ProtectionPlan & { commissionBps?: number };

const NO_PROTECTION: ProtectionPlan = { code: 'none', label: 'No protection', description: '', pricePerDay: 0 };

/** CatoDrive's tiers, plus every insurer plan that may be sold on this car when one is given. */
export async function listProtectionPlans(vehicle?: PlanVehicle): Promise<ProtectionPlan[]> {
  const cfg = await platformConfigService.get();
  const own: ProtectionPlan[] = cfg.protection;
  if (!vehicle) return own;
  return [...own, ...(await insurancePlanService.eligibleFor(vehicle))];
}

/** Resolve a plan by code for this car, falling back to the cheapest CatoDrive tier. */
export async function getProtectionPlan(code?: string, vehicle?: PlanVehicle): Promise<ResolvedProtectionPlan> {
  if (vehicle) {
    const insurerPlan = await insurancePlanService.resolve(code, vehicle);
    if (insurerPlan) return insurerPlan;
  }
  const plans = (await platformConfigService.get()).protection as ProtectionPlan[];
  const found = plans.find((p) => p.code === code);
  if (found) return found;
  // Fall back to the cheapest tier rather than assuming index 0 is the free one.
  return [...plans].sort((a, b) => a.pricePerDay - b.pricePerDay)[0] ?? NO_PROTECTION;
}
