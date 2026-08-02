import { TicketModel, type TicketDoc, type TicketStatus } from '../infrastructure/ticket.model';
import { NotFoundError, ForbiddenError, ConflictError } from '../../../core/errors/app-error';
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

    // Stamp first response the first time an agent replies publicly — the basis
    // for the first-response-time KPI.
    const firstResponse = opts.isAgent && !internal && !ticket.firstRespondedAt ? { firstRespondedAt: new Date() } : {};

    await TicketModel.updateOne(
      { _id: ticketId },
      {
        $push: { messages: { authorId, body, internal, at: new Date() } },
        $set: { status: opts.isAgent ? 'pending' : 'open', ...firstResponse },
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
    await this.setStatus(ticketId, 'escalated', { priority: 'urgent', wasEscalated: true });
    return this.getDoc(ticketId);
  }

  async resolve(ticketId: string): Promise<TicketDoc> {
    await this.setStatus(ticketId, 'resolved', { resolvedAt: new Date() });
    return this.getDoc(ticketId);
  }

  /** The requester rates support after their ticket is resolved (CSAT). */
  async rateCsat(userId: string, ticketId: string, rating: number): Promise<TicketDoc> {
    const ticket = await this.getDoc(ticketId);
    if (ticket.userId !== userId) throw new ForbiddenError('Not your ticket');
    if (!['resolved', 'closed'].includes(ticket.status)) {
      throw new ConflictError('You can rate support once your ticket is resolved', 'NOT_RESOLVED');
    }
    await TicketModel.updateOne({ _id: ticketId }, { csat: Math.max(1, Math.min(5, Math.round(rating))) });
    return this.getDoc(ticketId);
  }

  /**
   * Support KPIs over a window: first-response time, resolution time, CSAT,
   * ticket volume by status, and escalation rate — the numbers a support lead
   * runs the queue on. All derived from real ticket timestamps.
   */
  async metrics(days = 30): Promise<{
    windowDays: number;
    volume: number;
    byStatus: Record<string, number>;
    firstResponseMinutes: number | null;
    resolutionMinutes: number | null;
    csatAvg: number | null;
    csatCount: number;
    escalationRatePct: number;
  }> {
    const since = new Date(Date.now() - days * 86_400_000);
    const tickets = await TicketModel.find({ deletedAt: null, createdAt: { $gte: since } })
      .select('status createdAt firstRespondedAt resolvedAt csat wasEscalated')
      .lean<{ status: string; createdAt: Date; firstRespondedAt?: Date; resolvedAt?: Date; csat?: number; wasEscalated?: boolean }[]>();

    const median = (xs: number[]): number | null => {
      if (xs.length === 0) return null;
      const s = [...xs].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
    };
    const mins = (a: Date, b: Date) => (+new Date(b) - +new Date(a)) / 60_000;

    const byStatus: Record<string, number> = {};
    for (const t of tickets) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    const csats = tickets.filter((t) => typeof t.csat === 'number').map((t) => t.csat as number);
    const escalated = tickets.filter((t) => t.wasEscalated).length;

    return {
      windowDays: days,
      volume: tickets.length,
      byStatus,
      firstResponseMinutes: median(tickets.filter((t) => t.firstRespondedAt).map((t) => mins(t.createdAt, t.firstRespondedAt!))),
      resolutionMinutes: median(tickets.filter((t) => t.resolvedAt).map((t) => mins(t.createdAt, t.resolvedAt!))),
      csatAvg: csats.length ? Math.round((csats.reduce((s, c) => s + c, 0) / csats.length) * 10) / 10 : null,
      csatCount: csats.length,
      escalationRatePct: tickets.length ? Math.round((escalated / tickets.length) * 100) : 0,
    };
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