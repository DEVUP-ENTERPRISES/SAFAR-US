import { AuditLogModel, type AuditLogDoc } from '../infrastructure/audit-log.model';

export interface AuditInput {
  actorId: string;
  actorRoles: string[];
  action: string;
  resourceType?: string;
  resourceId?: string;
  ip?: string;
  status: number;
  correlationId?: string;
}

export class AuditService {
  async record(input: AuditInput): Promise<void> {
    // Fire-and-forget; auditing must never break the request path.
    AuditLogModel.create({ ...input, at: new Date() }).catch(() => undefined);
  }

  async query(opts: { actorId?: string; action?: string; limit?: number; skip?: number }): Promise<{
    items: AuditLogDoc[];
    total: number;
  }> {
    const limit = Math.min(opts.limit ?? 50, 100);
    const filter: Record<string, unknown> = {};
    if (opts.actorId) filter.actorId = opts.actorId;
    if (opts.action) filter.action = new RegExp(opts.action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const [items, total] = await Promise.all([
      AuditLogModel.find(filter).sort({ at: -1 }).skip(opts.skip ?? 0).limit(limit).lean<AuditLogDoc[]>(),
      AuditLogModel.countDocuments(filter),
    ]);
    return { items, total };
  }
}

export const auditService = new AuditService();
