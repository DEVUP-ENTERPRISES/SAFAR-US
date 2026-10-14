import { NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { InsurancePartnerModel, type InsurancePartnerDoc } from '../infrastructure/insurance-partner.model';
import { InsurancePlanModel, type InsurancePlanDoc } from '../infrastructure/insurance-plan.model';
import { insurancePartnerService } from './insurance-partner.service';

/** Checkout codes for insurer plans; platform plans keep their own short codes. */
export const INSURER_PLAN_PREFIX = 'ins_';
export const insurerPlanCode = (planId: string) => `${INSURER_PLAN_PREFIX}${planId}`;
export const planIdFromCode = (code?: string) => (code?.startsWith(INSURER_PLAN_PREFIX) ? code.slice(INSURER_PLAN_PREFIX.length) : null);

export interface InsurerPlanInput {
  name: string;
  description?: string;
  pricePerDay: number;
  deductibleCents: number;
  liabilityLimitCents: number;
  coverage: string[];
  states: string[];
  categories: string[];
  active: boolean;
  sortOrder?: number;
}

/** What checkout shows for an insurer's plan. */
export interface InsurerCheckoutPlan {
  code: string;
  label: string;
  description: string;
  pricePerDay: number;
  insurer: { id: string; name: string };
  deductibleCents: number;
  liabilityLimitCents: number;
  coverage: string[];
}

/** The car facts that decide which plans may be sold on it. */
export interface PlanVehicle {
  location?: { state?: string };
  category?: string;
}

const upper = (list: string[]) => [...new Set(list.map((s) => s.trim().toUpperCase()).filter(Boolean))];
const lower = (list: string[]) => [...new Set(list.map((s) => s.trim().toLowerCase()).filter(Boolean))];

function covers(plan: InsurancePlanDoc, insurer: InsurancePartnerDoc, v: PlanVehicle): boolean {
  const state = v.location?.state?.toUpperCase();
  // An insurer may only sell where it is licensed, whatever the plan says.
  if (!state || !insurer.licensedStates.includes(state)) return false;
  if (plan.states.length && !plan.states.includes(state)) return false;
  if (plan.categories.length && (!v.category || !plan.categories.includes(v.category.toLowerCase()))) return false;
  return true;
}

const toCheckout = (plan: InsurancePlanDoc, insurer: InsurancePartnerDoc): InsurerCheckoutPlan => ({
  code: insurerPlanCode(plan._id),
  label: plan.name,
  description: plan.description,
  pricePerDay: plan.pricePerDay,
  insurer: { id: insurer._id, name: insurer.displayName },
  deductibleCents: plan.deductibleCents,
  liabilityLimitCents: plan.liabilityLimitCents,
  coverage: plan.coverage,
});

export class InsurancePlanService {
  async listMine(userId: string): Promise<InsurancePlanDoc[]> {
    const insurer = await insurancePartnerService.requireMember(userId);
    return InsurancePlanModel.find({ insurerId: insurer._id }).sort({ sortOrder: 1, createdAt: 1 }).lean<InsurancePlanDoc[]>().exec();
  }

  private clean(insurer: InsurancePartnerDoc, input: InsurerPlanInput) {
    const states = upper(input.states);
    const outside = states.filter((s) => !insurer.licensedStates.includes(s));
    if (outside.length) throw new ValidationError(`You aren’t licensed in ${outside.join(', ')}`);
    return { ...input, states, categories: lower(input.categories), coverage: input.coverage.map((c) => c.trim()).filter(Boolean) };
  }

  async create(userId: string, input: InsurerPlanInput): Promise<InsurancePlanDoc> {
    const insurer = await insurancePartnerService.requireApproved(userId);
    const doc = await InsurancePlanModel.create({ insurerId: insurer._id, ...this.clean(insurer, input) });
    return doc.toObject();
  }

  async update(userId: string, planId: string, input: InsurerPlanInput): Promise<InsurancePlanDoc> {
    const insurer = await insurancePartnerService.requireApproved(userId);
    const doc = await InsurancePlanModel.findOneAndUpdate({ _id: planId, insurerId: insurer._id }, { $set: this.clean(insurer, input) }, { new: true })
      .lean<InsurancePlanDoc>()
      .exec();
    if (!doc) throw new NotFoundError('Plan');
    return doc;
  }

  /** Active plans from approved insurers that may be sold on this car. */
  async eligibleFor(v: PlanVehicle): Promise<InsurerCheckoutPlan[]> {
    const insurers = await InsurancePartnerModel.find({ status: 'approved' }).lean<InsurancePartnerDoc[]>().exec();
    if (!insurers.length) return [];
    const byId = new Map(insurers.map((i) => [i._id, i]));
    const plans = await InsurancePlanModel.find({ active: true, insurerId: { $in: [...byId.keys()] } })
      .sort({ sortOrder: 1, pricePerDay: 1 })
      .lean<InsurancePlanDoc[]>()
      .exec();
    return plans.filter((p) => covers(p, byId.get(p.insurerId)!, v)).map((p) => toCheckout(p, byId.get(p.insurerId)!));
  }

  /**
   * An insurer plan picked at checkout, re-checked against the car, with the
   * commission split it will be booked at. Null when the code is not an
   * insurer plan, or the plan can no longer be sold on this car.
   */
  async resolve(code: string | undefined, v: PlanVehicle): Promise<(InsurerCheckoutPlan & { commissionBps: number }) | null> {
    const planId = planIdFromCode(code);
    if (!planId) return null;
    const plan = await InsurancePlanModel.findOne({ _id: planId, active: true }).lean<InsurancePlanDoc>().exec();
    if (!plan) return null;
    const insurer = await InsurancePartnerModel.findOne({ _id: plan.insurerId, status: 'approved' }).lean<InsurancePartnerDoc>().exec();
    if (!insurer || !covers(plan, insurer, v)) return null;
    return { ...toCheckout(plan, insurer), commissionBps: await insurancePartnerService.commissionBps(insurer) };
  }
}

export const insurancePlanService = new InsurancePlanService();
