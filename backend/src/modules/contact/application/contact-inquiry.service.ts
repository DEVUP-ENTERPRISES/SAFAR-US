import {
  ContactInquiryModel,
  type ContactInquiryDoc,
  type ContactStatus,
} from '../infrastructure/contact-inquiry.model';
import type { CreateContactInquiryDto } from '../dto/contact-inquiry.schemas';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { channelProviders } from '../../notifications/infrastructure/channel.providers';
import { NotFoundError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';

const INTEREST_LABEL: Record<string, string> = {
  asset_partner: 'Asset Partner',
  investor: 'Investor',
  corporate: 'Corporate Account',
  general: 'General',
  other: 'Other',
};

export class ContactInquiryService {
  /**
   * Public submission. Saved first — the durable, admin-visible record is
   * guaranteed regardless of whether the staff-notification email actually
   * sends — then a best-effort email goes to the admin-configured contact
   * address. A dead mail server must never make a genuine lead disappear.
   */
  async create(
    dto: CreateContactInquiryDto,
    ctx: { userId?: string; ip?: string; userAgent?: string },
  ): Promise<ContactInquiryDoc> {
    const doc = await ContactInquiryModel.create({
      fullName: dto.fullName,
      email: dto.email.toLowerCase(),
      phone: dto.phone,
      interest: dto.interest,
      message: dto.message,
      status: 'new',
      submittedByUserId: ctx.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    const { contact } = await platformConfigService.get();
    channelProviders.email
      .send({
        target: { userId: 'staff', email: contact.notifyEmail },
        templateKey: 'contact.inquiry',
        title: `New ${INTEREST_LABEL[dto.interest] ?? dto.interest} inquiry — ${dto.fullName}`,
        body:
          `${INTEREST_LABEL[dto.interest] ?? dto.interest} inquiry from ${dto.fullName} (${dto.email}` +
          `${dto.phone ? `, ${dto.phone}` : ''}):\n\n${dto.message}\n\n— Reply directly to this address, or review it in the admin console.`,
      })
      .catch((err) => logger.warn({ err: (err as Error).message }, 'contact inquiry staff email failed'));

    logger.info({ id: doc._id, interest: dto.interest, email: dto.email }, '📬 New contact inquiry');
    return doc.toObject();
  }

  async adminList(opts: { status?: ContactStatus; interest?: string; limit?: number; skip?: number }): Promise<{
    items: ContactInquiryDoc[];
    total: number;
  }> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const filter: Record<string, unknown> = {};
    if (opts.status) filter.status = opts.status;
    if (opts.interest) filter.interest = opts.interest;
    const [items, total] = await Promise.all([
      ContactInquiryModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(opts.skip ?? 0)
        .limit(limit)
        .lean<ContactInquiryDoc[]>(),
      ContactInquiryModel.countDocuments(filter),
    ]);
    return { items, total };
  }

  async adminOne(id: string): Promise<ContactInquiryDoc> {
    const doc = await ContactInquiryModel.findById(id).lean<ContactInquiryDoc>();
    if (!doc) throw new NotFoundError('Contact inquiry');
    return doc;
  }

  async markResponded(id: string, staffId: string, notes?: string): Promise<ContactInquiryDoc> {
    const doc = await ContactInquiryModel.findByIdAndUpdate(
      id,
      { status: 'responded', respondedBy: staffId, respondedAt: new Date(), adminNotes: notes },
      { new: true },
    ).lean<ContactInquiryDoc>();
    if (!doc) throw new NotFoundError('Contact inquiry');
    return doc;
  }

  /** Counts by interest category, for the admin queue's filter tabs. */
  async countsByInterest(): Promise<Record<string, number>> {
    const rows = await ContactInquiryModel.aggregate<{ _id: string; count: number }>([
      { $match: { status: 'new' } },
      { $group: { _id: '$interest', count: { $sum: 1 } } },
    ]);
    return Object.fromEntries(rows.map((r) => [r._id, r.count]));
  }
}

export const contactInquiryService = new ContactInquiryService();
