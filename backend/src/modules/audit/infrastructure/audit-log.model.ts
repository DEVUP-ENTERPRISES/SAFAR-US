import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/** Append-only audit record of privileged actions. Never edited or deleted. */
export interface AuditLogDoc {
  _id: string;
  actorId: string;
  actorRoles: string[];
  action: string; // e.g. "POST /users/:id/status"
  resourceType?: string;
  resourceId?: string;
  ip?: string;
  userAgent?: string;
  /**
   * What actually changed. An audit line saying "someone called PATCH /users/x"
   * cannot answer "who suspended this account and what were they looking at" —
   * which is the only question anyone asks of an audit log during an incident.
   */
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  /** Why. Required on privileged mutations; the confirm dialog collects it. */
  reason?: string;
  status: number;
  correlationId?: string;
  at: Date;
  createdAt: Date;
}

const schema = new Schema<AuditLogDoc>(
  {
    _id: { type: String, default: () => uuid() },
    actorId: { type: String, required: true },
    actorRoles: { type: [String], default: [] },
    action: { type: String, required: true },
    resourceType: String,
    resourceId: String,
    ip: String,
    userAgent: String,
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    reason: String,
    status: Number,
    correlationId: String,
    at: { type: Date, default: () => new Date() },
  },
  { timestamps: { createdAt: true, updatedAt: false }, _id: false },
);

schema.index({ actorId: 1, at: -1 });
schema.index({ resourceType: 1, resourceId: 1, at: -1 });
schema.index({ at: -1 });

export const AuditLogModel = model<AuditLogDoc>('AuditLog', schema);
