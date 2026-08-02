import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export interface NotificationDoc {
  _id: string;
  userId: string;
  channel: 'push' | 'email' | 'sms' | 'inapp';
  templateKey: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  priority?: 'critical' | 'high' | 'normal' | 'low';
  /** Where tapping this lands — never the app home. */
  deepLink?: string;
  /** One row per channel attempt: the delivery log an operator reads. */
  attempts?: {
    channel: string;
    at: Date;
    ok: boolean;
    providerId?: string;
    error?: string;
    /** False = permanent failure a retry worker must not re-attempt. */
    retryable?: boolean;
  }[];
  delivery?: { suppressed?: string };
  status: 'queued' | 'sent' | 'read' | 'failed';
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<NotificationDoc>(
  {
    _id: { type: String, default: () => uuid() },
    userId: { type: String, required: true },
    channel: { type: String, required: true, enum: ['push', 'email', 'sms', 'inapp'] },
    templateKey: { type: String, required: true },
    title: { type: String, default: '' },
    body: { type: String, default: '' },
    data: { type: Schema.Types.Mixed, default: {} },
    priority: { type: String, default: 'normal', enum: ['critical', 'high', 'normal', 'low'] },
    deepLink: String,
    attempts: {
      type: [{ channel: String, at: Date, ok: Boolean, providerId: String, error: String, retryable: Boolean }],
      default: [],
    },
    delivery: { suppressed: String },
    status: { type: String, default: 'queued', enum: ['queued', 'sent', 'read', 'failed'] },
    readAt: Date,
  },
  { timestamps: true, _id: false },
);

schema.index({ userId: 1, createdAt: -1 });
schema.index({ status: 1 });

export const NotificationModel = model<NotificationDoc>('Notification', schema);
