import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export type TicketStatus = 'open' | 'pending' | 'escalated' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface TicketMessage {
  authorId: string;
  body: string;
  internal: boolean; // agent-only note
  at: Date;
}

export interface TicketDoc {
  _id: string;
  userId: string;
  subject: string;
  category: string;
  priority: TicketPriority;
  status: TicketStatus;
  assignedTo?: string;
  relatedType?: string;
  relatedId?: string;
  messages: TicketMessage[];
  slaDueAt?: Date;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const schema = new Schema<TicketDoc>(
  {
    _id: { type: String, default: () => uuid() },
    userId: { type: String, required: true },
    subject: { type: String, required: true },
    category: { type: String, default: 'general' },
    priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
    status: { type: String, default: 'open' },
    assignedTo: String,
    relatedType: String,
    relatedId: String,
    messages: {
      type: [{ authorId: String, body: String, internal: { type: Boolean, default: false }, at: Date }],
      default: [],
    },
    slaDueAt: Date,
    resolvedAt: Date,
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, _id: false },
);

schema.index({ status: 1, priority: 1, slaDueAt: 1 });
schema.index({ assignedTo: 1, status: 1 });
schema.index({ userId: 1, createdAt: -1 });

export const TicketModel = model<TicketDoc>('Ticket', schema);
