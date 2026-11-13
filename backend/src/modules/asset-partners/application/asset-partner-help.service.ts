import { TicketModel, type TicketDoc } from '../../support/infrastructure/ticket.model';
import { ticketService } from '../../support/application/ticket.service';
import { withConversation, withRequesters } from '../../support/application/ticket-people.service';
import { AssetPartnerModel } from '../infrastructure/asset-partner.model';
import { NotFoundError } from '../../../core/errors/app-error';

/** Support tickets opened from the partner site carry this category; the partner team answers them in the operations panel. */
export const PARTNER_HELP_CATEGORY = 'asset_partner';

async function partnerIds(userIds: string[]): Promise<Map<string, string>> {
  const rows = await AssetPartnerModel.find({ userId: { $in: [...new Set(userIds)] } }).select('_id userId').lean<{ _id: string; userId: string }[]>();
  return new Map(rows.map((r) => [r.userId, r._id]));
}

async function partnerTicket(id: string): Promise<TicketDoc> {
  const t = await TicketModel.findOne({ _id: id, category: PARTNER_HELP_CATEGORY, deletedAt: null }).lean<TicketDoc>();
  if (!t) throw new NotFoundError('Conversation');
  return t;
}

/** Partner chats and meeting requests for the operations panel: open ones first, newest activity first. */
export const assetPartnerHelpService = {
  async list(opts: { open?: boolean; limit?: number; skip?: number }) {
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
    const filter: Record<string, unknown> = { category: PARTNER_HELP_CATEGORY, deletedAt: null };
    filter.status = opts.open === false ? { $in: ['resolved', 'closed'] } : { $nin: ['resolved', 'closed'] };
    const [items, total] = await Promise.all([
      TicketModel.find(filter).sort({ updatedAt: -1 }).skip(opts.skip ?? 0).limit(limit).lean<TicketDoc[]>(),
      TicketModel.countDocuments(filter),
    ]);
    const [rows, partners] = await Promise.all([withRequesters(items), partnerIds(items.map((t) => t.userId))]);
    return {
      total,
      items: rows.map((t) => {
        const last = [...t.messages].reverse().find((m) => !m.internal);
        return { _id: t._id, subject: t.subject, status: t.status, updatedAt: (t as TicketDoc & { updatedAt?: Date }).updatedAt, requester: t.requester, partnerId: partners.get(t.userId), lastMessage: last ? { body: last.body.slice(0, 140), fromPartner: last.authorId === t.userId, at: last.at } : undefined };
      }),
    };
  },

  async get(id: string) {
    const t = await partnerTicket(id);
    const [conversation, partners] = await Promise.all([withConversation(t), partnerIds([t.userId])]);
    return { ...conversation, partnerId: partners.get(t.userId) };
  },

  async reply(agentId: string, id: string, body: string) {
    await partnerTicket(id);
    await ticketService.reply(agentId, id, body, { isAgent: true });
    return this.get(id);
  },

  async resolve(id: string) {
    await partnerTicket(id);
    await ticketService.resolve(id);
    return this.get(id);
  },
};
