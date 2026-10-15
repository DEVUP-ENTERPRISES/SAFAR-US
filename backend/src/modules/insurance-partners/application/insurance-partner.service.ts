import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';
import { parseKey } from '../../../infrastructure/storage/storage.gateway';
import { notificationService } from '../../notifications/application/notification.service';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { InsurancePartnerModel, type InsurancePartnerDoc, type InsurancePartnerStatus } from '../infrastructure/insurance-partner.model';

export interface InsurerApplication {
  legalName: string;
  displayName: string;
  licenceNumber: string;
  licensedStates: string[];
  contactName: string;
  email: string;
  phone?: string;
  website?: string;
  licenceDoc?: { url: string; key?: string };
}

export interface InsurerPayoutDetailsInput {
  accountHolder: string;
  bankName: string;
  routingNumber: string;
  accountNumber: string;
}

/** The licence must be a file this account uploaded through CatoDrive, never an outside link. */
function assertOwnLicence(url: string, userId: string): void {
  let raw: string;
  try {
    const u = new URL(url);
    raw = decodeURIComponent(u.searchParams.get('key') ?? u.pathname);
  } catch {
    throw new ValidationError('Upload the licence through the form');
  }
  const parts = raw.split('/').filter(Boolean);
  const at = parts.indexOf('insurance');
  const parsed = at >= 0 ? parseKey(parts.slice(at).join('/')) : null;
  if (!parsed || parsed.category !== 'insurance' || parsed.ownerId !== userId) throw new ValidationError('Upload the licence through the form');
}

const states = (list: string[]) => [...new Set(list.map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s)))];

/** Insurance partners: self-serve sign-up and portal; staff approve, suspend and set commission. */
export class InsurancePartnerService {
  getByUserId(userId: string): Promise<InsurancePartnerDoc | null> {
    return InsurancePartnerModel.findOne({ userId }).lean<InsurancePartnerDoc>().exec();
  }

  /** The caller's insurer record, only once approved; anything else is refused. */
  async requireApproved(userId: string): Promise<InsurancePartnerDoc> {
    const insurer = await this.getByUserId(userId);
    if (!insurer) throw new NotFoundError('Insurance partner account');
    if (insurer.status !== 'approved') throw new ForbiddenError('Your insurance partner account is not active');
    return insurer;
  }

  /** A pending or approved insurer: plans can be set up while the company waits for approval. */
  async requirePlanner(userId: string): Promise<InsurancePartnerDoc> {
    const insurer = await this.getByUserId(userId);
    if (!insurer) throw new NotFoundError('Insurance partner account');
    if (insurer.status !== 'pending' && insurer.status !== 'approved') throw new ForbiddenError('Your insurance partner account is not active');
    return insurer;
  }

  /** An approved or suspended insurer: a suspended one is still owed money and can see it. */
  async requireMember(userId: string): Promise<InsurancePartnerDoc> {
    const insurer = await this.getByUserId(userId);
    if (!insurer || (insurer.status !== 'approved' && insurer.status !== 'suspended')) throw new NotFoundError('Insurance partner account');
    return insurer;
  }

  /** Apply, or resubmit after a rejection. An approved or suspended insurer cannot reapply over itself. */
  async apply(userId: string, input: InsurerApplication): Promise<InsurancePartnerDoc> {
    const licensedStates = states(input.licensedStates);
    if (!licensedStates.length) throw new ValidationError('Add at least one state you are licensed in');
    if (input.licenceDoc) assertOwnLicence(input.licenceDoc.url, userId);
    const existing = await this.getByUserId(userId);
    if (existing && existing.status !== 'rejected') {
      throw new ConflictError('This account already has an insurance partner application', 'INSURER_EXISTS');
    }
    const fields = { ...input, licensedStates, status: 'pending' as const };
    const doc = existing
      ? await InsurancePartnerModel.findByIdAndUpdate(existing._id, { $set: fields, $unset: { reviewNotes: 1, reviewedAt: 1, reviewedBy: 1 } }, { new: true }).lean<InsurancePartnerDoc>().exec()
      : (await InsurancePartnerModel.create({ userId, ...fields })).toObject();
    logger.info({ insurerId: doc!._id }, 'insurance partner applied');
    return doc!;
  }

  /** Contact details the insurer keeps current itself. Licence and states change through a new review. */
  async updateProfile(userId: string, patch: Partial<Pick<InsurerApplication, 'displayName' | 'contactName' | 'email' | 'phone' | 'website'>>): Promise<InsurancePartnerDoc> {
    const insurer = await this.getByUserId(userId);
    if (!insurer) throw new NotFoundError('Insurance partner account');
    const doc = await InsurancePartnerModel.findByIdAndUpdate(insurer._id, { $set: patch }, { new: true }).lean<InsurancePartnerDoc>().exec();
    return doc!;
  }

  /** Bank details for payouts. Only the last four digits of the account number are stored. */
  async setPayoutDetails(userId: string, d: InsurerPayoutDetailsInput): Promise<InsurancePartnerDoc> {
    const insurer = await this.requireMember(userId);
    const digits = d.accountNumber.replace(/\D/g, '');
    if (digits.length < 4) throw new ValidationError('Enter the full account number');
    const doc = await InsurancePartnerModel.findByIdAndUpdate(
      insurer._id,
      { $set: { payoutDetails: { accountHolder: d.accountHolder.trim(), bankName: d.bankName.trim(), routingNumber: d.routingNumber.replace(/\D/g, ''), accountLast4: digits.slice(-4) } } },
      { new: true },
    )
      .lean<InsurancePartnerDoc>()
      .exec();
    return doc!;
  }

  /** CatoDrive's commission on this insurer's premiums: the negotiated rate, else the platform default. */
  async commissionBps(insurer: Pick<InsurancePartnerDoc, 'commissionBps'>): Promise<number> {
    if (typeof insurer.commissionBps === 'number') return insurer.commissionBps;
    const cfg = await platformConfigService.get();
    return cfg.insurance.partnerCommissionBps ?? 1500;
  }

  async adminList(q: { status?: InsurancePartnerStatus; limit?: number; skip?: number }): Promise<{ items: InsurancePartnerDoc[]; total: number }> {
    const filter = q.status ? { status: q.status } : {};
    const [items, total] = await Promise.all([
      InsurancePartnerModel.find(filter).sort({ createdAt: -1 }).skip(q.skip ?? 0).limit(q.limit ?? 50).lean<InsurancePartnerDoc[]>().exec(),
      InsurancePartnerModel.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  async adminOne(id: string): Promise<InsurancePartnerDoc> {
    const doc = await InsurancePartnerModel.findById(id).lean<InsurancePartnerDoc>().exec();
    if (!doc) throw new NotFoundError('Insurance partner');
    return doc;
  }

  /** Approve or reject a pending application, and tell the insurer. */
  async review(id: string, staffId: string, decision: 'approved' | 'rejected', notes?: string): Promise<InsurancePartnerDoc> {
    const now = new Date();
    const doc = await InsurancePartnerModel.findOneAndUpdate(
      { _id: id, status: 'pending' },
      { $set: { status: decision, reviewNotes: notes, reviewedBy: staffId, reviewedAt: now, ...(decision === 'approved' ? { approvedAt: now } : {}) } },
      { new: true },
    )
      .lean<InsurancePartnerDoc>()
      .exec();
    if (!doc) throw new ConflictError('Only a pending application can be reviewed', 'INSURER_NOT_PENDING');
    await notificationService
      .send({
        userId: doc.userId,
        priority: 'high',
        deepLink: '/insurers/portal',
        templateKey: decision === 'approved' ? 'account.insurer_approved' : 'account.insurer_rejected',
        title: decision === 'approved' ? 'You’re approved as an insurance partner' : 'Your insurance partner application',
        body:
          decision === 'approved'
            ? 'Your company is approved. Guests see each of your plans at checkout once CatoDrive has approved it.'
            : `We couldn’t approve the application${notes ? `: ${notes}` : '.'} You can update it and apply again.`,
        data: { insurerId: doc._id, decision },
      })
      .catch((err) => logger.warn({ err, insurerId: doc._id }, 'insurer review notice failed'));
    return doc;
  }

  /** Suspend (plans leave checkout immediately; money already earned is still owed) or reinstate. */
  async setStatus(id: string, status: 'approved' | 'suspended', reason?: string): Promise<InsurancePartnerDoc> {
    const from = status === 'suspended' ? 'approved' : 'suspended';
    const doc = await InsurancePartnerModel.findOneAndUpdate(
      { _id: id, status: from },
      status === 'suspended' ? { $set: { status, suspendedAt: new Date(), suspendedReason: reason } } : { $set: { status }, $unset: { suspendedAt: 1, suspendedReason: 1 } },
      { new: true },
    )
      .lean<InsurancePartnerDoc>()
      .exec();
    if (!doc) throw new ConflictError(status === 'suspended' ? 'Only an approved insurer can be suspended' : 'Only a suspended insurer can be reinstated', 'INSURER_STATUS');
    return doc;
  }

  /** Set a negotiated commission, or null to return to the platform default. Applies to bookings made from now on. */
  async setCommission(id: string, commissionBps: number | null): Promise<InsurancePartnerDoc> {
    const doc = await InsurancePartnerModel.findByIdAndUpdate(
      id,
      commissionBps === null ? { $unset: { commissionBps: 1 } } : { $set: { commissionBps } },
      { new: true },
    )
      .lean<InsurancePartnerDoc>()
      .exec();
    if (!doc) throw new NotFoundError('Insurance partner');
    return doc;
  }
}

export const insurancePartnerService = new InsurancePartnerService();
