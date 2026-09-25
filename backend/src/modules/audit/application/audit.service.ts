import { AuditLogModel, type AuditLogDoc } from '../infrastructure/audit-log.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { ROLES } from '../../../shared/constants/rbac';

const STAFF_ROLES = [ROLES.SUPER_ADMIN, ROLES.SUPPORT, ROLES.MODERATOR, ROLES.FINANCE, ROLES.OPS];

export type AuditRow = AuditLogDoc & { actor?: { name: string; email?: string } };

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

  /** Staff actions by default (who did what in the admin), each row carrying the actor's name so nobody has to decode an id. */
  async query(opts: { actorId?: string; action?: string; staffOnly?: boolean; limit?: number; skip?: number }): Promise<{
    items: AuditRow[];
    total: number;
  }> {
    const limit = Math.min(opts.limit ?? 50, 100);
    const filter: Record<string, unknown> = {};
    if (opts.actorId) filter.actorId = opts.actorId;
    if (opts.staffOnly) filter.actorRoles = { $in: STAFF_ROLES };
    if (opts.action) filter.action = new RegExp(opts.action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const [rows, total] = await Promise.all([
      AuditLogModel.find(filter).sort({ at: -1 }).skip(opts.skip ?? 0).limit(limit).lean<AuditLogDoc[]>(),
      AuditLogModel.countDocuments(filter),
    ]);
    const ids = [...new Set(rows.map((r) => r.actorId))];
    const users = await UserModel.find({ _id: { $in: ids } }).select('email firstName lastName').lean<{ _id: string; email?: string; firstName?: string; lastName?: string }[]>();
    const byId = new Map(users.map((u) => [u._id, { name: [u.firstName, u.lastName].filter(Boolean).join(' ') || (u.email ?? 'Unknown'), email: u.email }]));
    return { items: rows.map((r) => ({ ...r, actor: byId.get(r.actorId) })), total };
  }
}

export const auditService = new AuditService();
