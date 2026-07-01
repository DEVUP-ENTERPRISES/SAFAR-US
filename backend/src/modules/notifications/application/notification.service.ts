import { NotificationModel, type NotificationDoc } from '../infrastructure/notification.model';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Multi-channel delivery. In this build the in-app channel persists to the
 * feed and push/email/sms are logged (provider adapters plug in behind the
 * same method in production, dispatched via BullMQ workers with retries).
 */
export class NotificationService {
  async send(input: {
    userId: string;
    channel?: NotificationDoc['channel'];
    templateKey: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  }): Promise<NotificationDoc> {
    const notification = await NotificationModel.create({
      userId: input.userId,
      channel: input.channel ?? 'inapp',
      templateKey: input.templateKey,
      title: input.title,
      body: input.body,
      data: input.data ?? {},
      status: 'sent',
    });
    logger.info(
      { userId: input.userId, template: input.templateKey, channel: notification.channel },
      '🔔 notification dispatched',
    );
    return notification.toObject();
  }

  async listForUser(userId: string, limit = 30): Promise<NotificationDoc[]> {
    return NotificationModel.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean<NotificationDoc[]>();
  }

  async markRead(userId: string, ids: string[]): Promise<void> {
    await NotificationModel.updateMany(
      { _id: { $in: ids }, userId },
      { status: 'read', readAt: new Date() },
    );
  }
}

export const notificationService = new NotificationService();
