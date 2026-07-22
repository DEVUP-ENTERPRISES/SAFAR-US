import { NotificationModel, type NotificationDoc } from '../infrastructure/notification.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { channelProviders } from '../infrastructure/channel.providers';
import {
  CHANNELS_BY_PRIORITY,
  isQuietTime,
  respectsQuietHours,
  type Channel,
  type Priority,
} from '../domain/notification-channel';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Multi-channel delivery.
 *
 * Every message lands in the in-app feed, and — depending on how urgent it is
 * — also goes out over push, SMS and email. Previously push/email/sms were
 * written to a log line and never sent, so a host without the tab open never
 * learned a booking request had arrived, and the 24-hour expiry job then
 * killed those requests against hosts who were never told.
 */
export class NotificationService {
  async send(input: {
    userId: string;
    /** Force a single channel. Omit and priority decides the fan-out. */
    channel?: NotificationDoc['channel'];
    priority?: Priority;
    templateKey: string;
    title: string;
    body: string;
    /** Where tapping this should land, e.g. /bookings/abc123. */
    deepLink?: string;
    data?: Record<string, unknown>;
  }): Promise<NotificationDoc> {
    const priority = input.priority ?? 'normal';

    // The in-app record is the durable one: it is the feed, and it is the
    // delivery log every other channel reports back into.
    const notification = await NotificationModel.create({
      userId: input.userId,
      channel: input.channel ?? 'inapp',
      priority,
      templateKey: input.templateKey,
      title: input.title,
      body: input.body,
      data: input.data ?? {},
      deepLink: input.deepLink,
      status: 'sent',
    });

    // Fan out without blocking the caller — a booking must not fail because
    // an SMS provider is slow.
    void this.fanOut(notification._id, input.userId, priority, {
      templateKey: input.templateKey,
      title: input.title,
      body: input.body,
      deepLink: input.deepLink,
      data: input.data,
      only: input.channel && input.channel !== 'inapp' ? input.channel : undefined,
    });

    return notification.toObject();
  }

  /** Deliver over every channel this priority calls for, recording each result. */
  private async fanOut(
    notificationId: string,
    userId: string,
    priority: Priority,
    msg: {
      templateKey: string;
      title: string;
      body: string;
      deepLink?: string;
      data?: Record<string, unknown>;
      only?: Exclude<Channel, 'inapp'>;
    },
  ): Promise<void> {
    try {
      const user = await UserModel.findOne({ _id: userId }).lean();
      if (!user) return;

      if (respectsQuietHours(priority) && isQuietTime(user.timezone)) {
        await NotificationModel.updateOne(
          { _id: notificationId },
          { $set: { 'delivery.suppressed': 'quiet_hours' } },
        );
        return;
      }

      const channels = (msg.only
        ? [msg.only]
        : CHANNELS_BY_PRIORITY[priority].filter((c): c is Exclude<Channel, 'inapp'> => c !== 'inapp'));

      const target = {
        userId,
        email: user.email,
        phone: user.phone,
        pushTokens: user.pushTokens ?? [],
        locale: user.locale,
        timezone: user.timezone,
      };

      for (const channel of channels) {
        const provider = channelProviders[channel];
        const result = await provider.send({
          target,
          templateKey: msg.templateKey,
          title: msg.title,
          body: msg.body,
          deepLink: msg.deepLink,
          data: msg.data,
        });

        await NotificationModel.updateOne(
          { _id: notificationId },
          {
            $push: {
              attempts: {
                channel,
                at: new Date(),
                ok: result.ok,
                providerId: result.providerId,
                error: result.error,
              },
            },
          },
        );

        if (!result.ok && result.retryable) {
          logger.warn(
            { channel, userId, template: msg.templateKey, error: result.error },
            'notification delivery failed, will retry',
          );
        }
      }
    } catch (err) {
      logger.error({ err, userId, notificationId }, 'notification fan-out failed');
    }
  }

  /** Everything we tried to send for one notification — the delivery log. */
  async deliveryLog(notificationId: string): Promise<NotificationDoc | null> {
    return NotificationModel.findById(notificationId).lean<NotificationDoc>();
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
