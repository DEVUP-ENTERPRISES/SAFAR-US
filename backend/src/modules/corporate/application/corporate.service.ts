import {
  OrgModel, MemberModel, CostCenterModel, PolicyModel, RequestModel,
  type OrgDoc, type MemberDoc, type CostCenterDoc, type PolicyDoc, type RequestDoc, type CorpRole,
} from '../infrastructure/corporate.models';
import { userRepository } from '../../users/infrastructure/user.repository';
import { vehicleService } from '../../vehicles/application/vehicle.service';
import { pricingService } from '../../pricing/application/pricing.service';
import { bookingService } from '../../bookings/application/booking.service';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../../../core/errors/app-error';

export interface OrgContext {
  org: OrgDoc;
  membership: MemberDoc;
}

export class CorporateService {
  // ── Org & membership ─────────────────────────────────────────────────
  async createOrg(userId: string, name: string, billingEmail: string, domain?: string): Promise<OrgDoc> {
    const existing = await MemberModel.findOne({ userId, status: 'active' }).lean();
    if (existing) throw new ConflictError('You already belong to an organization', 'ALREADY_MEMBER');

    const org = await OrgModel.create({ name, billingEmail, domain, createdBy: userId });
    const user = await userRepository.findById(userId);
    await MemberModel.create({
      orgId: org._id,
      userId,
      email: user?.email ?? billingEmail,
      role: 'corp_admin',
      status: 'active',
    });
    await PolicyModel.create({ orgId: org._id });
    return org.toObject();
  }

  /** Resolve the user's org + membership (throws if not a member). */
  async context(userId: string): Promise<OrgContext> {
    const membership = await MemberModel.findOne({ userId, status: 'active' }).lean<MemberDoc>();
    if (!membership) throw new NotFoundError('Organization membership');
    const org = await OrgModel.findOne({ _id: membership.orgId, deletedAt: null }).lean<OrgDoc>();
    if (!org) throw new NotFoundError('Organization');
    return { org, membership };
  }

  async myOrg(userId: string): Promise<OrgContext | null> {
    try {
      return await this.context(userId);
    } catch {
      return null;
    }
  }

  private assertManager(ctx: OrgContext): void {
    if (ctx.membership.role !== 'corp_admin' && ctx.membership.role !== 'manager') {
      throw new ForbiddenError('Requires an admin or manager role');
    }
  }
  private assertAdmin(ctx: OrgContext): void {
    if (ctx.membership.role !== 'corp_admin') throw new ForbiddenError('Requires a corporate admin role');
  }

  // ── Members ──────────────────────────────────────────────────────────
  async listMembers(userId: string): Promise<MemberDoc[]> {
    const ctx = await this.context(userId);
    return MemberModel.find({ orgId: ctx.org._id, status: { $ne: 'removed' } }).sort({ createdAt: 1 }).lean<MemberDoc[]>();
  }

  async inviteMember(userId: string, email: string, role: CorpRole, costCenterId?: string): Promise<MemberDoc> {
    const ctx = await this.context(userId);
    this.assertAdmin(ctx);
    const existingUser = await userRepository.findByEmail(email);
    const member = await MemberModel.findOneAndUpdate(
      { orgId: ctx.org._id, email: email.toLowerCase() },
      {
        $set: { role, costCenterId, status: existingUser ? 'active' : 'invited', userId: existingUser?._id },
        $setOnInsert: { orgId: ctx.org._id, email: email.toLowerCase() },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean<MemberDoc>();
    return member!;
  }

  async removeMember(userId: string, memberId: string): Promise<void> {
    const ctx = await this.context(userId);
    this.assertAdmin(ctx);
    const member = await MemberModel.findOne({ _id: memberId, orgId: ctx.org._id });
    if (!member) throw new NotFoundError('Member');
    if (member.role === 'corp_admin') throw new ConflictError('Cannot remove a corporate admin', 'ADMIN_PROTECTED');
    await MemberModel.updateOne({ _id: memberId }, { status: 'removed' });
  }

  // ── Cost centers ─────────────────────────────────────────────────────
  async listCostCenters(userId: string): Promise<CostCenterDoc[]> {
    const ctx = await this.context(userId);
    return CostCenterModel.find({ orgId: ctx.org._id }).sort({ createdAt: 1 }).lean<CostCenterDoc[]>();
  }
  async createCostCenter(userId: string, name: string, code: string, budget: number): Promise<CostCenterDoc> {
    const ctx = await this.context(userId);
    this.assertManager(ctx);
    const cc = await CostCenterModel.create({ orgId: ctx.org._id, name, code, budget });
    return cc.toObject();
  }

  // ── Travel policy ────────────────────────────────────────────────────
  async getPolicy(userId: string): Promise<PolicyDoc> {
    const ctx = await this.context(userId);
    let policy = await PolicyModel.findOne({ orgId: ctx.org._id }).lean<PolicyDoc>();
    if (!policy) policy = (await PolicyModel.create({ orgId: ctx.org._id })).toObject();
    return policy;
  }
  async setPolicy(userId: string, patch: Partial<PolicyDoc>): Promise<PolicyDoc> {
    const ctx = await this.context(userId);
    this.assertAdmin(ctx);
    const allowed = ['maxDailyPrice', 'allowedCategories', 'autoApproveUnder', 'requireApprovalOver'] as const;
    const set: Record<string, unknown> = {};
    allowed.forEach((k) => { if (patch[k] !== undefined) set[k] = patch[k]; });
    await PolicyModel.updateOne({ orgId: ctx.org._id }, { $set: set }, { upsert: true });
    return this.getPolicy(userId);
  }

  // ── Trip requests + approval workflow ────────────────────────────────
  async createRequest(
    userId: string,
    input: { vehicleId: string; start: Date; end: Date; costCenterId?: string; reason?: string },
  ): Promise<RequestDoc> {
    const ctx = await this.context(userId);
    if (input.start >= input.end) throw new ValidationError('start must be before end');

    const vehicle = await vehicleService.getById(input.vehicleId);
    const quote = await pricingService.quote({ vehicleId: input.vehicleId, start: input.start, end: input.end });
    const policy = await this.getPolicy(userId);

    // Evaluate policy.
    const flags: string[] = [];
    if (policy.maxDailyPrice > 0 && vehicle.pricing.dailyPrice > policy.maxDailyPrice) flags.push('over_daily_price_cap');
    if (policy.allowedCategories.length > 0 && !policy.allowedCategories.includes(vehicle.category)) flags.push('category_not_allowed');
    if (policy.requireApprovalOver > 0 && quote.total.amount > policy.requireApprovalOver) flags.push('over_approval_threshold');

    const autoApprove =
      flags.length === 0 && policy.autoApproveUnder > 0 && quote.total.amount <= policy.autoApproveUnder;

    const user = await userRepository.findById(userId);
    const req = await RequestModel.create({
      orgId: ctx.org._id,
      employeeUserId: userId,
      employeeEmail: user?.email ?? '',
      vehicleId: input.vehicleId,
      costCenterId: input.costCenterId,
      start: input.start,
      end: input.end,
      estimatedTotal: quote.total.amount,
      currency: quote.currency,
      reason: input.reason,
      policyFlags: flags,
      status: autoApprove ? 'approved' : 'pending',
      decidedBy: autoApprove ? 'system' : undefined,
      decisionNote: autoApprove ? 'Auto-approved under policy' : undefined,
    });
    return req.toObject();
  }

  async listRequests(userId: string, status?: string): Promise<RequestDoc[]> {
    const ctx = await this.context(userId);
    const filter: Record<string, unknown> = { orgId: ctx.org._id };
    if (status) filter.status = status;
    return RequestModel.find(filter).sort({ createdAt: -1 }).limit(200).lean<RequestDoc[]>();
  }

  async decideRequest(userId: string, requestId: string, decision: 'approved' | 'rejected', note?: string): Promise<RequestDoc> {
    const ctx = await this.context(userId);
    this.assertManager(ctx);
    const req = await RequestModel.findOne({ _id: requestId, orgId: ctx.org._id });
    if (!req) throw new NotFoundError('Request');
    if (req.status !== 'pending') throw new ConflictError('Request already decided', 'INVALID_STATE');
    req.status = decision;
    req.decidedBy = userId;
    req.decisionNote = note;
    await req.save();
    return req.toObject();
  }

  /** Convert an approved request into a real booking billed to the org. */
  async bookApproved(userId: string, requestId: string): Promise<RequestDoc> {
    const ctx = await this.context(userId);
    const req = await RequestModel.findOne({ _id: requestId, orgId: ctx.org._id });
    if (!req) throw new NotFoundError('Request');
    if (req.employeeUserId !== userId && ctx.membership.role === 'employee') {
      throw new ForbiddenError('Not your request');
    }
    if (req.status !== 'approved') throw new ConflictError('Request is not approved', 'NOT_APPROVED');

    const booking = await bookingService.create(
      req.employeeUserId,
      { vehicleId: req.vehicleId, start: req.start.toISOString(), end: req.end.toISOString() },
      `corp-${req._id}`,
      { orgId: ctx.org._id, costCenterId: req.costCenterId },
    );
    req.status = 'booked';
    req.bookingId = booking._id;
    await req.save();
    return req.toObject();
  }

  // ── Dashboard + consolidated invoicing ───────────────────────────────
  async dashboard(userId: string): Promise<{
    org: OrgDoc;
    role: CorpRole;
    members: number;
    costCenters: number;
    pendingApprovals: number;
    totalTrips: number;
    totalSpend: number;
    currency: string;
    /** Spend trend + composition for the analytics charts. */
    spendByMonth: { month: string; amount: number }[];
    spendByCostCenter: { label: string; value: number }[];
  }> {
    const ctx = await this.context(userId);
    const [members, costCenters, pending, bookings, ccDocs] = await Promise.all([
      MemberModel.countDocuments({ orgId: ctx.org._id, status: { $ne: 'removed' } }),
      CostCenterModel.countDocuments({ orgId: ctx.org._id }),
      RequestModel.countDocuments({ orgId: ctx.org._id, status: 'pending' }),
      bookingService.orgBookings(ctx.org._id),
      CostCenterModel.find({ orgId: ctx.org._id }).lean<{ _id: string; name: string }[]>(),
    ]);
    const billable = bookings.filter((b) => ['paid', 'in_progress', 'completed'].includes(b.status));
    const totalSpend = billable.reduce((s, b) => s + b.priceBreakdown.total.amount, 0);

    // Monthly spend, zero-filled across the last 6 months so the line has no gaps.
    const monthMap = new Map<string, number>();
    for (const b of billable) {
      const k = new Date(b.createdAt).toISOString().slice(0, 7);
      monthMap.set(k, (monthMap.get(k) ?? 0) + b.priceBreakdown.total.amount);
    }
    const spendByMonth: { month: string; amount: number }[] = [];
    const d = new Date();
    d.setMonth(d.getMonth() - 5);
    d.setDate(1);
    for (let i = 0; i < 6; i++) {
      const k = d.toISOString().slice(0, 7);
      spendByMonth.push({ month: k, amount: monthMap.get(k) ?? 0 });
      d.setMonth(d.getMonth() + 1);
    }

    // Spend by cost center (the donut). Bookings carry `corp.costCenterId`.
    const ccName = new Map(ccDocs.map((c) => [c._id, c.name]));
    const ccMap = new Map<string, number>();
    for (const b of billable) {
      // costCenterId is a top-level booking field, not nested under `corp`.
      const id = (b as unknown as { costCenterId?: string }).costCenterId ?? 'unassigned';
      ccMap.set(id, (ccMap.get(id) ?? 0) + b.priceBreakdown.total.amount);
    }
    const spendByCostCenter = [...ccMap.entries()]
      .map(([id, value]) => ({ label: id === 'unassigned' ? 'Unassigned' : ccName.get(id) ?? id, value }))
      .sort((a, b) => b.value - a.value);

    return {
      org: ctx.org,
      role: ctx.membership.role,
      members,
      costCenters,
      pendingApprovals: pending,
      totalTrips: billable.length,
      totalSpend,
      currency: 'USD',
      spendByMonth,
      spendByCostCenter,
    };
  }

  async invoice(userId: string, from?: Date, to?: Date): Promise<{
    period: { from?: string; to?: string };
    lines: { bookingCode: string; date: string; costCenter: string; vehicleId: string; amount: number; status: string }[];
    byCostCenter: { costCenterId: string; name: string; amount: number }[];
    total: number;
    currency: string;
  }> {
    const ctx = await this.context(userId);
    this.assertManager(ctx);
    const bookings = (await bookingService.orgBookings(ctx.org._id, from, to)).filter((b) =>
      ['paid', 'in_progress', 'completed'].includes(b.status),
    );
    const centers = await CostCenterModel.find({ orgId: ctx.org._id }).lean<CostCenterDoc[]>();
    const nameOf = (id?: string) => centers.find((c) => c._id === id)?.name ?? 'Unassigned';

    const lines = bookings.map((b) => ({
      bookingCode: b.code,
      date: b.createdAt.toISOString(),
      costCenter: nameOf(b.costCenterId),
      vehicleId: b.vehicleId,
      amount: b.priceBreakdown.total.amount,
      status: b.status,
    }));
    const grouped = new Map<string, { costCenterId: string; name: string; amount: number }>();
    for (const b of bookings) {
      const key = b.costCenterId ?? 'unassigned';
      const g = grouped.get(key) ?? { costCenterId: key, name: nameOf(b.costCenterId), amount: 0 };
      g.amount += b.priceBreakdown.total.amount;
      grouped.set(key, g);
    }
    const total = bookings.reduce((s, b) => s + b.priceBreakdown.total.amount, 0);
    return {
      period: { from: from?.toISOString(), to: to?.toISOString() },
      lines,
      byCostCenter: [...grouped.values()],
      total,
      currency: 'USD',
    };
  }
}

export const corporateService = new CorporateService();
