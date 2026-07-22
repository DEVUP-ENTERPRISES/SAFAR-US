import { AuditLogModel, type AuditLogDoc } from '../infrastructure/audit-log.model';

export interface AuditInput {
  actorId: string;
  actorRoles: string[];
  action: string;
  resourceType?: string;
  resourceId?: string;
  ip?: string;
  userAgent?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
  status: number;
  correlationId?: string;
}

export class AuditService {
  async record(input: AuditInput): Promise<void> {
    // Fire-and-forget; auditing must never break the request path.
    AuditLogModel.create({ ...input, at: new Date() }).catch(() => undefined);
  }

  /** Everything ever done TO one resource — the object's own history. */
  async forResource(resourceType: string, resourceId: string, limit = 100): Promise<AuditLogDoc[]> {
    return AuditLogModel.find({ resourceType, resourceId })
      .sort({ at: -1 })
      .limit(limit)
      .lean<AuditLogDoc[]>();
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
