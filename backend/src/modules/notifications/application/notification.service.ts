import { NotificationModel, type NotificationDoc } from '../infrastructure/notification.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { channelProviders } from '../infrastructure/channel.providers';
import {
  categoryFor,
  resolveChannels,
  isQuietTime,
  respectsQuietHours,
  RETRY_SCHEDULE,
  type Channel,
  type Priority,
} from '../domain/notification-channel';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
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
    /** Label for the email CTA button. Falls back to "View details". */
    actionLabel?: string;
    data?: Record<string, unknown>;
    /** Detail rows for the email copy (car, dates, pickup place); other channels ignore them. */
    facts?: { label: string; value: string }[];
    /** Rental terms for the email's "Important terms" box. */
    terms?: string[];
  }): Promise<NotificationDoc> {
    const priority = input.priority ?? 'normal';
    const category = categoryFor(input.templateKey);

    // The in-app record is the durable one: it is the feed, and it is the
    // delivery log every other channel reports back into.
    const notification = await NotificationModel.create({
      userId: input.userId,
      channel: input.channel ?? 'inapp',
      category,
      priority,
      templateKey: input.templateKey,
      title: input.title,
      body: input.body,
      data: input.data ?? {},
      deepLink: input.deepLink,
      actionLabel: input.actionLabel,
      facts: input.facts,
      terms: input.terms,
      status: 'sent',
    });

    // Fan out without blocking the caller — a booking must not fail because
    // an SMS provider is slow.
    void this.fanOut(notification._id, input.userId, priority, category, {
      templateKey: input.templateKey,
      title: input.title,
      body: input.body,
      deepLink: input.deepLink,
      actionLabel: input.actionLabel,
      data: input.data,
      facts: input.facts,
      terms: input.terms,
      only: input.channel && input.channel !== 'inapp' ? input.channel : undefined,
    });

    return notification.toObject();
  }

  /** Deliver over every channel this priority calls for, recording each result. */
  private async fanOut(
    notificationId: string,
    userId: string,
    priority: Priority,
    category: ReturnType<typeof categoryFor>,
    msg: {
      templateKey: string;
      title: string;
      body: string;
      deepLink?: string;
      actionLabel?: string;
      data?: Record<string, unknown>;
      facts?: { label: string; value: string }[];
      terms?: string[];
      only?: Exclude<Channel, 'inapp'>;
    },
  ): Promise<void> {
    try {
      const user = await UserModel.findOne({ _id: userId }).lean();
      if (!user) return;

      const prefs = user.notificationPrefs ?? {};
      // Quiet hours honour BOTH platform urgency rules and the user's own toggle.
      if (respectsQuietHours(priority) && prefs.quietHours !== false && isQuietTime(user.timezone)) {
        await NotificationModel.updateOne(
          { _id: notificationId },
          { $set: { 'delivery.suppressed': 'quiet_hours' } },
        );
        return;
      }

      // Channels = urgency ∩ admin routing matrix (category) ∩ user preferences.
      const matrix = (await platformConfigService.get()).notifications.categoryChannels;
      const channels = msg.only
        ? [msg.only]
        : resolveChannels(priority, category, matrix, prefs).filter(
            (c): c is Exclude<Channel, 'inapp'> => c !== 'inapp',
          );

      for (const channel of channels) await this.deliver(notificationId, user, channel, msg);
    } catch (err) {
      logger.error({ err, userId, notificationId }, 'notification fan-out failed');
    }
  }

  /** One channel, one attempt, logged on the notification. */
  private async deliver(
    notificationId: string,
    user: { _id: string; email?: string; phone?: string; pushTokens?: string[]; locale?: string; timezone?: string },
    channel: Exclude<Channel, 'inapp'>,
    msg: { templateKey: string; title: string; body: string; deepLink?: string; actionLabel?: string; data?: Record<string, unknown>; facts?: { label: string; value: string }[]; terms?: string[] },
  ): Promise<void> {
    const result = await channelProviders[channel].send({
      target: {
        userId: user._id,
        email: user.email,
        phone: user.phone,
        pushTokens: user.pushTokens ?? [],
        locale: user.locale,
        timezone: user.timezone,
      },
      templateKey: msg.templateKey,
      title: msg.title,
      body: msg.body,
      deepLink: msg.deepLink,
      actionLabel: msg.actionLabel,
      data: msg.data,
      facts: msg.facts,
      terms: msg.terms,
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
            // A missing provider or unregistered device is permanent; the retry job skips those.
            retryable: result.ok ? undefined : result.retryable ?? true,
          },
        },
      },
    );

    if (!result.ok && result.retryable) {
      logger.warn({ channel, userId: user._id, template: msg.templateKey, error: result.error }, 'notification delivery failed, will retry');
    }
  }

  /** Job: re-send channels that failed for a passing reason, on the priority's back-off schedule. */
  async retryFailed(now = new Date()): Promise<number> {
    const since = new Date(now.getTime() - 24 * 3_600_000);
    const pending = await NotificationModel.find({
      createdAt: { $gte: since },
      attempts: { $elemMatch: { ok: false, retryable: true } },
    })
      .sort({ createdAt: 1 })
      .limit(200)
      .lean<NotificationDoc[]>();

    let retried = 0;
    for (const n of pending) {
      const schedule = RETRY_SCHEDULE[n.priority ?? 'normal'];
      const byChannel = new Map<string, NonNullable<NotificationDoc['attempts']>>();
      for (const a of n.attempts ?? []) byChannel.set(a.channel, [...(byChannel.get(a.channel) ?? []), a]);

      for (const [channel, tries] of byChannel) {
        const last = tries[tries.length - 1];
        if (tries.some((t) => t.ok) || !last.retryable) continue;
        const wait = schedule[tries.length - 1];
        if (wait === undefined || now.getTime() - new Date(last.at).getTime() < wait) continue;
        const user = await UserModel.findOne({ _id: n.userId }).lean();
        if (!user) break;
        await this.deliver(n._id, user, channel as Exclude<Channel, 'inapp'>, n);
        retried++;
      }
    }
    return retried;
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
