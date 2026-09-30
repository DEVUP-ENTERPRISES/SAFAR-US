import { platformConfigService } from '../../platform-config/application/platform-config.service';

/**
 * Protection tiers the guest chooses at checkout. Every trip is insured through
 * the car's Wheelbase plan; a tier only changes how much of a loss the guest
 * carries. Tiers come from PlatformConfig so they are edited from the admin panel.
 */
export interface ProtectionPlan {
  code: string;
  label: string;
  description: string;
  /** Per day, in minor units (cents). */
  pricePerDay: number;
  /** The Wheelbase tier this plan is sold as. */
  wheelbaseTier?: string;
  /** What the guest pays toward damage under this plan, in cents. */
  deductibleCents?: number;
}

const INCLUDED: ProtectionPlan = { code: 'basic', label: 'Wheelbase protection', description: 'Included with every trip.', pricePerDay: 0 };

/** A paid plan is only sold when it maps to a real Wheelbase tier, so no guest pays for cover nobody provides. */
export const isOffered = (p: ProtectionPlan) => p.pricePerDay === 0 || !!p.wheelbaseTier?.trim();

/** The plans a guest can choose, cheapest first. */
export async function listProtectionPlans(): Promise<ProtectionPlan[]> {
  const offered = (await platformConfigService.get()).protection.filter(isOffered);
  return offered.length ? [...offered].sort((a, b) => a.pricePerDay - b.pricePerDay) : [INCLUDED];
}

/** Resolve an offered plan by code, falling back to the cheapest offered tier. */
export async function getProtectionPlan(code?: string): Promise<ProtectionPlan> {
  const plans = await listProtectionPlans();
  return plans.find((p) => p.code === code) ?? plans[0];
}
