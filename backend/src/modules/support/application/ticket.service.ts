import { TicketModel, type TicketDoc, type TicketStatus } from '../infrastructure/ticket.model';
import { NotFoundError, ForbiddenError } from '../../../core/errors/app-error';
import { realtimeEmitter } from '../../../realtime/emitter';
import { notificationService } from '../../notifications/application/notification.service';
import { platformConfigService } from '../../platform-config/application/platform-config.service';

// SLA targets come from PlatformConfig — support leads retune them, not devs.

export class TicketService {
  async create(
    userId: string,
    input: { subject: string; category?: string; priority?: TicketDoc['priority']; body: string; relatedType?: string; relatedId?: string },
  ): Promise<TicketDoc> {
    const priority = input.priority ?? 'normal';
    const cfg = await platformConfigService.get();
    const slaHours = cfg.support.slaHours[priority] ?? cfg.support.slaHours.normal;
    const ticket = await TicketModel.create({
      userId,
      subject: input.subject,
      category: input.category ?? 'general',
      priority,
      relatedType: input.relatedType,
      relatedId: input.relatedId,
      slaDueAt: new Date(Date.now() + slaHours * 3_600_000),
      messages: [{ authorId: userId, body: input.body, internal: false, at: new Date() }],
    });
    return ticket.toObject();
  }

  async get(userId: string, ticketId: string, isAgent: boolean): Promise<TicketDoc> {
    const ticket = await this.getDoc(ticketId);
    if (!isAgent && ticket.userId !== userId) throw new ForbiddenError('Not your ticket');
    // Requester never sees internal notes.
    if (!isAgent) ticket.messages = ticket.messages.filter((m) => !m.internal);
    return ticket;
  }

  async listForUser(userId: string): Promise<TicketDoc[]> {
    return TicketModel.find({ userId, deletedAt: null }).sort({ createdAt: -1 }).lean<TicketDoc[]>();
  }

  /** Reply — used by both the requester and agents (live chat). */
  async reply(
    authorId: string,
    ticketId: string,
    body: string,
    opts: { isAgent: boolean; internal?: boolean },
  ): Promise<TicketDoc> {
    const ticket = await this.getDoc(ticketId);
    if (!opts.isAgent && ticket.userId !== authorId) throw new ForbiddenError('Not your ticket');
    const internal = opts.isAgent ? !!opts.internal : false;

    await TicketModel.updateOne(
      { _id: ticketId },
      {
        $push: { messages: { authorId, body, internal, at: new Date() } },
        $set: { status: opts.isAgent ? 'pending' : 'open' },
      },
    );

    // Live push + notification to the counterpart (agent↔requester chat).
    if (!internal) {
      realtimeEmitter.toUser(ticket.userId, 'ticket:message', { ticketId, from: opts.isAgent ? 'agent' : 'you' });
      if (opts.isAgent) {
        await notificationService.send({
          userId: ticket.userId,
          templateKey: 'support.reply',
          title: 'Support replied',
          body: body.slice(0, 80),
          data: { ticketId },
        });
      }
    }
    return this.getDoc(ticketId);
  }

  // ── Admin / agent ──────────────────────────────────────────────────
  async adminList(opts: { status?: string; priority?: string; limit?: number; skip?: number }): Promise<{
    items: TicketDoc[];
    total: number;
  }> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const filter: Record<string, unknown> = { deletedAt: null };
    if (opts.status) filter.status = opts.status;
    if (opts.priority) filter.priority = opts.priority;
    const [items, total] = await Promise.all([
      TicketModel.find(filter).sort({ slaDueAt: 1, createdAt: -1 }).skip(opts.skip ?? 0).limit(limit).lean<TicketDoc[]>(),
      TicketModel.countDocuments(filter),
    ]);
    return { items, total };
  }

  async assign(ticketId: string, agentId: string): Promise<TicketDoc> {
    await this.setStatus(ticketId, 'pending', { assignedTo: agentId });
    return this.getDoc(ticketId);
  }

  async escalate(ticketId: string): Promise<TicketDoc> {
    await this.setStatus(ticketId, 'escalated', { priority: 'urgent' });
    return this.getDoc(ticketId);
  }

  async resolve(ticketId: string): Promise<TicketDoc> {
    await this.setStatus(ticketId, 'resolved', { resolvedAt: new Date() });
    return this.getDoc(ticketId);
  }

  async count(filter: Record<string, unknown> = {}): Promise<number> {
    return TicketModel.countDocuments({ deletedAt: null, ...filter });
  }

  /**
   * SLA health across the open queue. "Breached" = still unresolved past its
   * due time; "at risk" = due within the next 2 hours. Computed from real
   * ticket timestamps — no stored flag to drift out of sync.
   */
  async slaStats(): Promise<SlaStats> {
    const now = new Date();
    const soon = new Date(Date.now() + 2 * 3_600_000);

    const open = await TicketModel.find({
      deletedAt: null,
      status: { $nin: ['resolved', 'closed'] },
    })
      .select('subject priority slaDueAt')
      .lean<{ _id: string; subject: string; priority: string; slaDueAt?: Date }[]>();

    const breachedTickets = open
      .filter((t) => t.slaDueAt && +new Date(t.slaDueAt) < +now)
      .map((t) => ({
        _id: t._id,
        subject: t.subject,
        priority: t.priority,
        slaDueAt: t.slaDueAt!,
        overdueHours: Math.round(((+now - +new Date(t.slaDueAt!)) / 3_600_000) * 10) / 10,
      }))
      .sort((a, b) => b.overdueHours - a.overdueHours);

    const atRisk = open.filter(
      (t) => t.slaDueAt && +new Date(t.slaDueAt) >= +now && +new Date(t.slaDueAt) <= +soon,
    ).length;

    return {
      open: open.length,
      breached: breachedTickets.length,
      atRisk,
      onTrack: open.length - breachedTickets.length - atRisk,
      breachedTickets: breachedTickets.slice(0, 20),
    };
  }

  private async setStatus(ticketId: string, status: TicketStatus, extra: Record<string, unknown> = {}): Promise<void> {
    const res = await TicketModel.updateOne({ _id: ticketId }, { status, ...extra });
    if (res.matchedCount === 0) throw new NotFoundError('Ticket');
  }

  private async getDoc(ticketId: string): Promise<TicketDoc> {
    const ticket = await TicketModel.findOne({ _id: ticketId, deletedAt: null }).lean<TicketDoc>();
    if (!ticket) throw new NotFoundError('Ticket');
    return ticket;
  }
}

/** SLA health: what is breached, what is about to breach. */
export interface SlaStats {
  open: number;
  breached: number;
  atRisk: number; // due within 25% of the window
  onTrack: number;
  breachedTickets: { _id: string; subject: string; priority: string; slaDueAt: Date; overdueHours: number }[];
}

export const ticketService = new TicketService();