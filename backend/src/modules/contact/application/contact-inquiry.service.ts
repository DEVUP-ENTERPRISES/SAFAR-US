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
  website_info: 'Website information',
  general: 'General',
  other: 'Other',
};

// Acknowledgement wording from the CatoDrive compliance package, section 26.
export function websiteInfoAck(name: string, contactEmail: string): string {
  return [
    `Hi ${name.split(' ')[0]},`,
    'Thank you for bringing this matter to CatoDrive’s attention.',
    'We take questions concerning the accuracy of our website information, financial statistics, service descriptions, and other published statements seriously.',
    'We have referred your inquiry to the appropriate department for review. Our review may include examination of the relevant reporting period, underlying records, calculation methodology, and applicable company documentation.',
    'If we identify an error or inconsistency, we will evaluate the appropriate corrective action.',
    'If you have not already done so, please reply with the specific statement, webpage, or material your inquiry relates to so that we can direct the matter to the appropriate team.',
    'Thank you for contacting CatoDrive.',
    `CatoDrive Inc.\n${contactEmail}`,
  ].join('\n\n');
}

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

    if (dto.interest === 'website_info') {
      channelProviders.email
        .send({
          target: { userId: ctx.userId ?? 'guest', email: doc.email },
          templateKey: 'contact.website_info_ack',
          title: 'Acknowledgement of Website Information Inquiry',
          body: websiteInfoAck(dto.fullName, contact.notifyEmail),
        })
        .catch((err) => logger.warn({ err: (err as Error).message }, 'website information acknowledgement failed'));
    }

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
